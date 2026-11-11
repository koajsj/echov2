import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { DeliveryEnvelope, DeliveryReceipt, MessagePage, CiphertextRecord } from "../../shared/contracts.js";
import { limits } from "../../shared/contracts.js";
import { transaction } from "../storage/database.js";
import { HttpError } from "../api/http-error.js";

const maxSequence = 9223372036854775807n;
export function sequence(value: string): string {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) > maxSequence) throw new HttpError(400,"INVALID_SEQUENCE","无效的序号或版本。");
  return value;
}
async function lockAccess(db: PoolClient, userId: string, deviceId: string, conversationId: string): Promise<void> {
  const user = await db.query("SELECT id FROM echo.users WHERE id=$1 AND status='active' FOR UPDATE",[userId]);
  if (!user.rowCount) throw new HttpError(401,"ACCOUNT_UNAVAILABLE","账号不可用。");
  // Account-first ordering serializes this user's access with revoke/suspend/delete.
  const access = await db.query(`SELECT d.id FROM echo.devices d
    JOIN echo.conversation_members m ON m.user_id=d.user_id
    JOIN echo.conversation_devices r ON r.conversation_id=m.conversation_id AND r.device_id=d.id
    JOIN echo.conversations c ON c.id=m.conversation_id
    WHERE d.id=$1 AND d.user_id=$2 AND d.status='active'
    AND EXISTS(SELECT 1 FROM echo.device_credentials k WHERE k.device_id=d.id AND k.revoked_at IS NULL AND k.expires_at>now())
    AND c.id=$3 AND c.status='active' AND m.active AND r.left_seq IS NULL FOR UPDATE OF d,c`, [deviceId,userId,conversationId]);
  if (!access.rowCount) throw new HttpError(403,"CONVERSATION_DENIED","当前设备不能访问此会话。");
}
export class DeliveryService {
  constructor(private readonly pool: Pool) {}
  async append(userId: string, deviceId: string, input: DeliveryEnvelope): Promise<DeliveryReceipt> {
    sequence(input.baseEpoch);
    const ciphertext = Buffer.from(input.ciphertext,"base64");
    if (!ciphertext.length || ciphertext.length > limits.envelopeBytes || ciphertext.toString("base64") !== input.ciphertext) throw new HttpError(400,"INVALID_CIPHERTEXT","密文编码或大小无效。");
    if (input.wireKind !== "application" && input.expiresAt !== null) throw new HttpError(400,"INVALID_EXPIRY","协议控制事件不能定时销毁。");
    const requestHash = createHash("sha256").update(JSON.stringify([input.operationId,input.messageId,input.conversationId,input.baseEpoch,input.wireKind,input.ciphertext,input.expiresAt])).digest("hex");
    return transaction(this.pool,async db => {
      await lockAccess(db,userId,deviceId,input.conversationId);
      const head = await db.query<{ route_epoch: string; last_seq: string }>("SELECT route_epoch::text,last_seq::text FROM echo.group_heads WHERE conversation_id=$1 FOR UPDATE", [input.conversationId]);
      if (!head.rows[0]) throw new HttpError(409,"GROUP_HEAD_MISSING","群组状态不可用。");
      const prior = await db.query<{ id: string; request_hash: string; seq: string; epoch: string; wire_kind: string }>("SELECT id,request_hash,seq::text,epoch::text,wire_kind FROM echo.messages WHERE sender_device_id=$1 AND operation_id=$2", [deviceId,input.operationId]);
      if (prior.rows[0]) {
        const row=prior.rows[0];
        if (row.request_hash !== requestHash) throw new HttpError(409,"OPERATION_CONFLICT","幂等操作内容不一致。");
        return { messageId: row.id,seq: row.seq,routeEpoch: (BigInt(row.epoch)+(row.wire_kind === "commit" ? 1n : 0n)).toString(),status: "accepted" };
      }
      if (head.rows[0].route_epoch !== input.baseEpoch) throw new HttpError(409,"EPOCH_CONFLICT","请同步已接受的群组事件。");
      const seq=(BigInt(head.rows[0].last_seq)+1n).toString();
      const nextEpoch=(BigInt(input.baseEpoch)+(input.wireKind === "commit" ? 1n : 0n)).toString();
      sequence(seq); sequence(nextEpoch);
      await db.query(`INSERT INTO echo.messages(id,conversation_id,seq,epoch,sender_user_id,sender_device_id,operation_id,request_hash,wire_kind,ciphertext,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [input.messageId,input.conversationId,seq,input.baseEpoch,userId,deviceId,input.operationId,requestHash,input.wireKind,ciphertext,input.expiresAt]);
      await db.query("UPDATE echo.group_heads SET last_seq=$2,route_epoch=$3 WHERE conversation_id=$1 AND route_epoch=$4", [input.conversationId,seq,nextEpoch,input.baseEpoch]);
      return { messageId: input.messageId,seq,routeEpoch: nextEpoch,status: "accepted" };
    });
  }
  async page(userId: string, deviceId: string, conversationId: string, after: string, limit: number): Promise<MessagePage> {
    sequence(after);
    return transaction(this.pool,async db => {
      await lockAccess(db,userId,deviceId,conversationId);
      const result = await db.query<{ joined_seq: string; last_seq: string }>("SELECT r.joined_seq::text,h.last_seq::text FROM echo.conversation_devices r JOIN echo.group_heads h USING(conversation_id) WHERE r.conversation_id=$1 AND r.device_id=$2", [conversationId,deviceId]);
      const high = result.rows[0]!;
      const rows = await db.query<CiphertextRecord>(`WITH candidates AS (
        SELECT id,seq,epoch,wire_kind,expires_at,
          CASE WHEN deleted_at IS NULL AND deletion_requested_at IS NULL
            AND (expires_at IS NULL OR expires_at>now())
            AND NOT EXISTS(SELECT 1 FROM echo.deletion_records x WHERE x.message_id=m.id)
          THEN ciphertext ELSE NULL END AS payload
        FROM echo.messages m WHERE conversation_id=$1 AND seq>$2 AND seq>=$3 AND seq<=$4
        ORDER BY seq LIMIT $5
      ), bounded AS (
        SELECT *,sum(coalesce(octet_length(payload),0)) OVER (ORDER BY seq) AS payload_bytes FROM candidates
      )
      SELECT id AS "messageId",seq::text,epoch::text,wire_kind AS "wireKind",
        translate(encode(payload,'base64'),chr(10),'') AS ciphertext,
        payload IS NULL AS deleted,expires_at AS "expiresAt"
      FROM bounded WHERE payload_bytes<=$6 ORDER BY seq`, [conversationId,after,high.joined_seq,high.last_seq,Math.min(limit,limits.maxPageSize),limits.pageBytes]);
      return { items: rows.rows,next: rows.rows.at(-1)?.seq ?? after,highWatermark: high.last_seq };
    });
  }
  async acknowledge(userId: string, deviceId: string, conversationId: string, acknowledged: string): Promise<void> {
    sequence(acknowledged);
    await transaction(this.pool,async db => {
      await lockAccess(db,userId,deviceId,conversationId);
      const head=await db.query("SELECT 1 FROM echo.group_heads WHERE conversation_id=$1 AND last_seq>=$2", [conversationId,acknowledged]);
      if (!head.rowCount) throw new HttpError(409,"CURSOR_AHEAD","确认游标超出持久日志。");
      await db.query("INSERT INTO echo.delivery_cursors(device_id,conversation_id,acknowledged_seq) VALUES($1,$2,$3) ON CONFLICT(device_id,conversation_id) DO UPDATE SET acknowledged_seq=greatest(echo.delivery_cursors.acknowledged_seq,excluded.acknowledged_seq)", [deviceId,conversationId,acknowledged]);
    });
  }
}
