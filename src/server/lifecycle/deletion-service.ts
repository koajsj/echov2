import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { transaction } from "../storage/database.js";
import { lockUserSession } from "../accounts/session-access.js";
import { HttpError } from "../api/http-error.js";
export class DeletionService {
  constructor(private readonly pool: Pool) {}
  async request(
    userId: string,
    sessionId: string,
    messageId: string,
    operationId: string,
  ): Promise<{
    state: string;
  }> {
    return transaction(this.pool, async (db) => {
      const binding = await db.query<{
        device_id: string | null;
      }>("SELECT device_id FROM echo.sessions WHERE id=$1 AND user_id=$2", [
        sessionId,
        userId,
      ]);
      if (!binding.rows[0]?.device_id)
        throw new HttpError(403, "TRUSTED_DEVICE_REQUIRED", "需要可信设备。");
      await lockUserSession(db, userId, sessionId, {
        recent: true,
        deviceId: binding.rows[0].device_id,
      });
      const message = await db.query<{
        conversation_id: string;
      }>(
        "SELECT conversation_id FROM echo.messages WHERE id=$1 AND sender_user_id=$2 AND wire_kind='application' FOR UPDATE",
        [messageId, userId],
      );
      if (!message.rows[0])
        throw new HttpError(404, "MESSAGE_NOT_FOUND", "没有可撤回的本人消息。");
      const operation = await db.query<{
        message_id: string;
      }>("SELECT message_id FROM echo.deletion_records WHERE operation_id=$1", [
        operationId,
      ]);
      if (operation.rows[0] && operation.rows[0].message_id !== messageId)
        throw new HttpError(
          409,
          "OPERATION_CONFLICT",
          "删除操作已绑定其它消息。",
        );
      const prior = await db.query<{
        operation_id: string;
        state: string;
      }>(
        "SELECT operation_id,state FROM echo.deletion_records WHERE message_id=$1",
        [messageId],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].operation_id !== operationId)
          throw new HttpError(
            409,
            "DELETION_ALREADY_REQUESTED",
            "该消息已有删除操作，请读取现有状态，不更换操作 ID。",
          );
        return {
          state: prior.rows[0].state,
        };
      }
      await db.query(
        "INSERT INTO echo.deletion_records(operation_id,conversation_id,message_id,requested_by,reason) VALUES($1,$2,$3,$4,'sender') ON CONFLICT(message_id) DO NOTHING",
        [operationId, message.rows[0].conversation_id, messageId, userId],
      );
      await db.query(
        "UPDATE echo.messages SET deletion_requested_at=now() WHERE id=$1 AND deletion_requested_at IS NULL",
        [messageId],
      );
      const state = await db.query<{
        state: string;
      }>("SELECT state FROM echo.deletion_records WHERE message_id=$1", [
        messageId,
      ]);
      return state.rows[0]!;
    });
  }
  async scheduleExpired(): Promise<void> {
    await transaction(this.pool, async (db) => {
      const result = await db.query<{
        id: string;
        conversation_id: string;
      }>(
        "SELECT id,conversation_id FROM echo.messages m WHERE wire_kind='application' AND expires_at<=now() AND deleted_at IS NULL AND deletion_requested_at IS NULL AND NOT EXISTS(SELECT 1 FROM echo.deletion_records x WHERE x.message_id=m.id) ORDER BY expires_at,id LIMIT 50 FOR UPDATE OF m SKIP LOCKED",
      );
      for (const row of result.rows) {
        await db.query(
          "INSERT INTO echo.deletion_records(operation_id,conversation_id,message_id,reason) VALUES($1,$2,$3,'expiry') ON CONFLICT(message_id) DO NOTHING",
          [randomUUID(), row.conversation_id, row.id],
        );
        await db.query(
          "UPDATE echo.messages SET deletion_requested_at=now() WHERE id=$1 AND deletion_requested_at IS NULL",
          [row.id],
        );
      }
    });
  }
  async ownRequests(userId: string, before: string | null) {
    const result = await this.pool.query(
      "SELECT x.id::text,x.message_id,x.reason,x.state,x.created_at FROM echo.deletion_records x JOIN echo.messages m ON m.id=x.message_id WHERE m.sender_user_id=$1 AND ($2::bigint IS NULL OR x.id<$2) ORDER BY x.id DESC LIMIT 51",
      [userId, before],
    );
    return {
      items: result.rows.slice(0, 50),
      next: result.rows.length > 50 ? (result.rows[49].id as string) : null,
    };
  }
}
