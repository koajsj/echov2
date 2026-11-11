import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type {
  DeliveryEnvelope,
  DeliveryReceipt,
  MessagePage,
  CiphertextRecord,
  ConversationPage,
  OperationView,
} from "../../shared/contracts.js";
import { limits } from "../../shared/contracts.js";
import { transaction } from "../storage/database.js";
import { lockUserSession } from "../accounts/session-access.js";
import { requireReviewedCrypto } from "../messaging/crypto-gate.js";
import { HttpError } from "../api/http-error.js";
const maxSequence = 9223372036854775807n;
export function sequence(value: string): string {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value) || BigInt(value) > maxSequence)
    throw new HttpError(400, "INVALID_SEQUENCE", "无效的序号或路由版本。");
  return value;
}
async function lockAccess(
  db: PoolClient,
  userId: string,
  sessionId: string,
  deviceId: string,
  conversationId: string,
): Promise<string> {
  await lockUserSession(db, userId, sessionId, {
    deviceId,
  });
  const conversation = await db.query<{
    status: string;
  }>(
    `SELECT c.status FROM echo.conversations c
    WHERE c.id=$1 AND c.status IN ('active','frozen')
    AND EXISTS(SELECT 1 FROM echo.conversation_members m WHERE m.conversation_id=c.id AND m.user_id=$2 AND m.active)
    AND EXISTS(SELECT 1 FROM echo.conversation_devices r WHERE r.conversation_id=c.id AND r.user_id=$2 AND r.device_id=$3 AND r.left_seq IS NULL)
    FOR UPDATE OF c`,
    [conversationId, userId, deviceId],
  );
  if (!conversation.rows[0])
    throw new HttpError(403, "CONVERSATION_DENIED", "当前设备不能访问此会话。");
  return conversation.rows[0].status;
}
export class DeliveryService {
  constructor(private readonly pool: Pool) {}
  async append(
    userId: string,
    sessionId: string,
    deviceId: string,
    input: DeliveryEnvelope,
  ): Promise<DeliveryReceipt> {
    requireReviewedCrypto();
    sequence(input.baseRouteVersion);
    const ciphertext = Buffer.from(input.ciphertext, "base64");
    if (
      !ciphertext.length ||
      ciphertext.length > limits.envelopeBytes ||
      ciphertext.toString("base64") !== input.ciphertext
    )
      throw new HttpError(400, "INVALID_CIPHERTEXT", "密文编码或大小无效。");
    if (input.wireKind !== "application" && input.expiresAt !== null)
      throw new HttpError(400, "INVALID_EXPIRY", "协议控制事件不能定时销毁。");
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify([
          input.operationId,
          input.messageId,
          input.conversationId,
          input.baseRouteVersion,
          input.wireKind,
          input.ciphertext,
          input.expiresAt,
        ]),
      )
      .digest("hex");
    return transaction(this.pool, async (db) => {
      const status = await lockAccess(
        db,
        userId,
        sessionId,
        deviceId,
        input.conversationId,
      );
      const head = await db.query<{
        route_version: string;
        last_seq: string;
        pending_commit_id: string | null;
      }>(
        "SELECT route_version::text,last_seq::text,pending_commit_id FROM echo.group_heads WHERE conversation_id=$1 FOR UPDATE",
        [input.conversationId],
      );
      if (!head.rows[0])
        throw new HttpError(409, "GROUP_HEAD_MISSING", "群组状态不可用。");
      const prior = await db.query<{
        id: string;
        request_hash: string;
        seq: string;
        route_version: string;
      }>(
        "SELECT id,request_hash,seq::text,route_version::text FROM echo.messages WHERE sender_device_id=$1 AND operation_id=$2",
        [deviceId, input.operationId],
      );
      if (prior.rows[0]) {
        const row = prior.rows[0];
        if (row.request_hash !== requestHash)
          throw new HttpError(
            409,
            "OPERATION_CONFLICT",
            "幂等操作内容不一致。",
          );
        return {
          messageId: row.id,
          seq: row.seq,
          routeVersion: row.route_version,
          status: "persisted-unverified",
        };
      }
      if (status !== "active" || head.rows[0].pending_commit_id)
        throw new HttpError(
          409,
          "CONVERSATION_FROZEN",
          "会话冻结或有未解决的 Commit，不能发送。",
        );
      if (head.rows[0].route_version !== input.baseRouteVersion)
        throw new HttpError(
          409,
          "ROUTE_VERSION_CONFLICT",
          "请同步已持久化的会话日志。",
        );
      const seq = sequence((BigInt(head.rows[0].last_seq) + 1n).toString());
      await db.query(
        `INSERT INTO echo.messages(id,conversation_id,seq,route_version,sender_user_id,sender_device_id,operation_id,request_hash,wire_kind,ciphertext,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          input.messageId,
          input.conversationId,
          seq,
          input.baseRouteVersion,
          userId,
          deviceId,
          input.operationId,
          requestHash,
          input.wireKind,
          ciphertext,
          input.expiresAt,
        ],
      );
      const updated = await db.query(
        `UPDATE echo.group_heads SET last_seq=$2,pending_commit_id=CASE WHEN $3::boolean THEN $4::uuid ELSE pending_commit_id END
        WHERE conversation_id=$1 AND route_version=$5 AND pending_commit_id IS NULL RETURNING conversation_id`,
        [
          input.conversationId,
          seq,
          input.wireKind === "commit",
          input.messageId,
          input.baseRouteVersion,
        ],
      );
      if (!updated.rowCount)
        throw new HttpError(409, "ROUTE_VERSION_CONFLICT", "路由状态已变化。");
      // wireKind is untrusted. Persisting a candidate never validates or advances an MLS epoch.
      // No reviewed native Commit/Welcome projection exists; there is deliberately no unfreeze API.
      if (input.wireKind === "commit")
        await db.query(
          "UPDATE echo.conversations SET status='frozen' WHERE id=$1",
          [input.conversationId],
        );
      return {
        messageId: input.messageId,
        seq,
        routeVersion: input.baseRouteVersion,
        status: "persisted-unverified",
      };
    });
  }
  async conversations(
    userId: string,
    sessionId: string,
    deviceId: string,
    after: string | null,
  ): Promise<ConversationPage> {
    return transaction(this.pool, async (db) => {
      await lockUserSession(db, userId, sessionId, {
        deviceId,
      });
      const result = await db.query<ConversationPage["items"][number]>(
        `SELECT c.id,c.kind,c.status,m.role,h.route_version::text AS "routeVersion",h.last_seq::text AS "lastSeq",
        coalesce(d.acknowledged_seq,0)::text AS "acknowledgedSeq"
        FROM echo.conversations c JOIN echo.conversation_members m ON m.conversation_id=c.id AND m.user_id=$1 AND m.active
        JOIN echo.conversation_devices r ON r.conversation_id=c.id AND r.user_id=$1 AND r.device_id=$2 AND r.left_seq IS NULL
        JOIN echo.group_heads h ON h.conversation_id=c.id
        LEFT JOIN echo.delivery_cursors d ON d.conversation_id=c.id AND d.device_id=$2
        WHERE c.status IN ('active','frozen') AND ($3::uuid IS NULL OR c.id>$3) ORDER BY c.id LIMIT 51`,
        [userId, deviceId, after],
      );
      return {
        items: result.rows.slice(0, 50),
        next: result.rows.length > 50 ? result.rows[49]!.id : null,
      };
    });
  }
  async page(
    userId: string,
    sessionId: string,
    deviceId: string,
    conversationId: string,
    after: string,
    limit: number,
  ): Promise<MessagePage> {
    sequence(after);
    return transaction(this.pool, async (db) => {
      await lockAccess(db, userId, sessionId, deviceId, conversationId);
      const result = await db.query<{
        joined_seq: string;
        last_seq: string;
      }>(
        "SELECT r.joined_seq::text,h.last_seq::text FROM echo.conversation_devices r JOIN echo.group_heads h USING(conversation_id) WHERE r.conversation_id=$1 AND r.device_id=$2",
        [conversationId, deviceId],
      );
      const high = result.rows[0]!;
      if (BigInt(after) > BigInt(high.last_seq))
        throw new HttpError(
          409,
          "CURSOR_AHEAD",
          "游标超出当前持久日志，禁止自动回滚本地状态。",
        );
      const rows = await db.query<CiphertextRecord>(
        `WITH candidates AS (
        SELECT id,seq,route_version,wire_kind,expires_at,
          CASE WHEN deleted_at IS NULL AND deletion_requested_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())
            AND NOT EXISTS(SELECT 1 FROM echo.deletion_records x WHERE x.message_id=m.id) THEN ciphertext ELSE NULL END AS payload
        FROM echo.messages m WHERE conversation_id=$1 AND seq>$2 AND seq>=$3 AND seq<=$4 ORDER BY seq LIMIT $5
      ), bounded AS (
        SELECT *,sum(coalesce(octet_length(payload),0)) OVER (ORDER BY seq) AS payload_bytes FROM candidates
      ) SELECT id AS "messageId",seq::text,route_version::text AS "routeVersion",wire_kind AS "wireKind",
        translate(encode(payload,'base64'),chr(10),'') AS ciphertext,payload IS NULL AS deleted,expires_at AS "expiresAt"
      FROM bounded WHERE payload_bytes<=$6 ORDER BY seq`,
        [
          conversationId,
          after,
          high.joined_seq,
          high.last_seq,
          Math.min(limit, limits.maxPageSize),
          limits.pageBytes,
        ],
      );
      return {
        items: rows.rows,
        next: rows.rows.at(-1)?.seq ?? after,
        highWatermark: high.last_seq,
      };
    });
  }
  async operation(
    userId: string,
    sessionId: string,
    deviceId: string,
    operationId: string,
  ): Promise<OperationView> {
    return transaction(this.pool, async (db) => {
      await lockUserSession(db, userId, sessionId, {
        deviceId,
      });
      const result = await db.query<{
        id: string;
        conversation_id: string;
        seq: string;
        route_version: string;
        wire_kind: string;
        ciphertext: Buffer | null;
        deletion_requested: boolean;
        expired: boolean;
      }>(
        `SELECT id,conversation_id,seq::text,route_version::text,wire_kind,ciphertext,
        deletion_requested_at IS NOT NULL AS deletion_requested,expires_at<=clock_timestamp() AS expired
        FROM echo.messages WHERE sender_user_id=$1 AND sender_device_id=$2 AND operation_id=$3`,
        [userId, deviceId, operationId],
      );
      const row = result.rows[0];
      if (!row)
        throw new HttpError(
          404,
          "OPERATION_NOT_OBSERVED",
          "当前读取未找到此操作；这不证明未知提交永远不会完成。不要生成新操作或重新加密。",
        );
      if (!row.ciphertext)
        throw new HttpError(
          410,
          "OPERATION_PAYLOAD_PURGED",
          "原密文不可得，不能验证原样重试。请查看删除状态。",
        );
      return {
        messageId: row.id,
        conversationId: row.conversation_id,
        seq: row.seq,
        routeVersion: row.route_version,
        wireKind: row.wire_kind,
        ciphertextSha256: createHash("sha256")
          .update(row.ciphertext)
          .digest("hex"),
        deletionRequested: row.deletion_requested,
        expired: row.expired === true,
        status: "persisted-unverified",
      };
    });
  }
  async acknowledge(
    userId: string,
    sessionId: string,
    deviceId: string,
    conversationId: string,
    acknowledged: string,
  ): Promise<void> {
    sequence(acknowledged);
    await transaction(this.pool, async (db) => {
      await lockAccess(db, userId, sessionId, deviceId, conversationId);
      const head = await db.query(
        "SELECT 1 FROM echo.group_heads WHERE conversation_id=$1 AND last_seq>=$2",
        [conversationId, acknowledged],
      );
      if (!head.rowCount)
        throw new HttpError(409, "CURSOR_AHEAD", "确认游标超出持久日志。");
      await db.query(
        "INSERT INTO echo.delivery_cursors(device_id,conversation_id,acknowledged_seq) VALUES($1,$2,$3) ON CONFLICT(device_id,conversation_id) DO UPDATE SET acknowledged_seq=greatest(echo.delivery_cursors.acknowledged_seq,excluded.acknowledged_seq)",
        [deviceId, conversationId, acknowledged],
      );
    });
  }
}
