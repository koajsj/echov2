import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { transaction } from "../storage/database.js";
import { HttpError } from "../api/http-error.js";

export class DeletionService {
  constructor(private readonly pool: Pool) {}
  async request(userId: string,sessionId: string,messageId: string,operationId: string): Promise<{ state: string }> {
    return transaction(this.pool,async db => {
      const user=await db.query("SELECT id FROM echo.users WHERE id=$1 AND status='active' FOR UPDATE",[userId]);
      if(!user.rowCount)throw new HttpError(401,"ACCOUNT_UNAVAILABLE","账号不可用。");
      const session=await db.query(`SELECT s.id FROM echo.sessions s JOIN echo.devices d ON d.id=s.device_id AND d.user_id=s.user_id
        WHERE s.id=$1 AND s.user_id=$2 AND s.audience='user' AND s.expires_at>now()
        AND s.reauthenticated_at>now()-interval '5 minutes'
        AND d.status='active' AND EXISTS(SELECT 1 FROM echo.device_credentials c WHERE c.device_id=d.id AND c.revoked_at IS NULL AND c.expires_at>now())
        FOR UPDATE OF s,d`,[sessionId,userId]);
      if(!session.rowCount)throw new HttpError(401,"SESSION_EXPIRED","会话已失效，请重新认证。");
      const message=await db.query<{ conversation_id: string }>("SELECT conversation_id FROM echo.messages WHERE id=$1 AND sender_user_id=$2 AND wire_kind='application' FOR UPDATE", [messageId,userId]);
      if (!message.rows[0]) throw new HttpError(404,"MESSAGE_NOT_FOUND","没有可撤回的本人消息。");
      const operation=await db.query<{message_id:string}>("SELECT message_id FROM echo.deletion_records WHERE operation_id=$1",[operationId]);
      if(operation.rows[0] && operation.rows[0].message_id!==messageId)throw new HttpError(409,"OPERATION_CONFLICT","删除操作已绑定其它消息。");
      await db.query("INSERT INTO echo.deletion_records(operation_id,conversation_id,message_id,requested_by,reason) VALUES($1,$2,$3,$4,'sender') ON CONFLICT(message_id) DO NOTHING", [operationId,message.rows[0].conversation_id,messageId,userId]);
      await db.query("UPDATE echo.messages SET deletion_requested_at=now() WHERE id=$1 AND deletion_requested_at IS NULL", [messageId]);
      const state=await db.query<{ state: string }>("SELECT state FROM echo.deletion_records WHERE message_id=$1", [messageId]);
      return state.rows[0]!;
    });
  }
  async scheduleExpired(): Promise<void> {
    await transaction(this.pool,async db => {
      const result=await db.query<{ id: string; conversation_id: string }>("SELECT id,conversation_id FROM echo.messages m WHERE wire_kind='application' AND expires_at<=now() AND deleted_at IS NULL AND deletion_requested_at IS NULL AND NOT EXISTS(SELECT 1 FROM echo.deletion_records x WHERE x.message_id=m.id) ORDER BY expires_at,id LIMIT 50 FOR UPDATE OF m SKIP LOCKED");
      for (const row of result.rows) {
        await db.query("INSERT INTO echo.deletion_records(operation_id,conversation_id,message_id,reason) VALUES($1,$2,$3,'expiry') ON CONFLICT(message_id) DO NOTHING", [randomUUID(),row.conversation_id,row.id]);
        await db.query("UPDATE echo.messages SET deletion_requested_at=now() WHERE id=$1 AND deletion_requested_at IS NULL", [row.id]);
      }
    });
  }
  async ownRequests(userId: string) {
    const result=await this.pool.query("SELECT id::text,message_id,reason,state,created_at FROM echo.deletion_records WHERE requested_by=$1 ORDER BY id DESC LIMIT 100", [userId]);
    return result.rows;
  }
}
