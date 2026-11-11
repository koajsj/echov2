import { randomUUID } from "node:crypto";
import type { AuthorizedSession } from "../accounts/sessions.js";
import type { Pool } from "pg";
import type { DeviceView } from "../../shared/contracts.js";
import { transaction } from "../storage/database.js";
import { lockUserSession } from "../accounts/session-access.js";
import { HttpError } from "../api/http-error.js";
export class DeviceService {
  constructor(private readonly pool: Pool) {}
  async list(
    userId: string,
    after: string | null,
  ): Promise<{ items: DeviceView[]; next: string | null }> {
    const result = await this.pool.query<DeviceView>(
      `SELECT id,label,status,created_at AS "createdAt" FROM echo.devices WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 51`,
      [userId, after],
    );
    return {
      items: result.rows.slice(0, 50),
      next: result.rows.length > 50 ? result.rows[49]!.id : null,
    };
  }
  async register(
    userId: string,
    sessionId: string,
    label: string,
  ): Promise<string> {
    return transaction(this.pool, async (db) => {
      // All device/lifecycle/delivery mutations lock the active account first.
      const user = await db.query(
        "SELECT id FROM echo.users WHERE id=$1 AND status='active' FOR UPDATE",
        [userId],
      );
      if (!user.rowCount)
        throw new HttpError(401, "ACCOUNT_UNAVAILABLE", "账号不可用。");
      const session = await db.query<{
        device_id: string | null;
      }>(
        "SELECT device_id FROM echo.sessions WHERE id=$1 AND user_id=$2 AND audience='user' AND expires_at>now() AND reauthenticated_at>now()-interval '5 minutes' FOR UPDATE",
        [sessionId, userId],
      );
      if (!session.rows[0])
        throw new HttpError(401, "SESSION_EXPIRED", "会话已失效。");
      if (session.rows[0].device_id)
        throw new HttpError(409, "DEVICE_ALREADY_BOUND", "本会话已绑定设备。");
      const count = await db.query<{
        count: number;
      }>(
        "SELECT count(*)::int AS count FROM echo.devices WHERE user_id=$1 AND status<>'revoked'",
        [userId],
      );
      if (count.rows[0]!.count >= 10)
        throw new HttpError(409, "DEVICE_LIMIT", "请先撤销不再使用的设备。");
      const id = randomUUID();
      await db.query(
        "INSERT INTO echo.devices(id,user_id,label) VALUES($1,$2,$3)",
        [id, userId, label],
      );
      await db.query("UPDATE echo.sessions SET device_id=$2 WHERE id=$1", [
        sessionId,
        id,
      ]);
      return id;
    });
  }
  async revoke(actor: AuthorizedSession, deviceId: string): Promise<string[]> {
    return transaction(this.pool, async (db) => {
      await lockUserSession(db, actor.account.id, actor.id, {
        audience: actor.audience,
        recent: true,
      });
      const owner = await db.query<{ user_id: string }>(
        "SELECT user_id FROM echo.devices WHERE id=$1",
        [deviceId],
      );
      const userId = owner.rows[0]?.user_id;
      if (
        !userId ||
        (actor.audience !== "admin" && userId !== actor.account.id)
      )
        throw new HttpError(404, "DEVICE_NOT_FOUND", "设备不存在。");
      if (userId !== actor.account.id)
        await db.query("SELECT id FROM echo.users WHERE id=$1 FOR UPDATE", [
          userId,
        ]);
      const device = await db.query<{ status: string }>(
        "SELECT status FROM echo.devices WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [deviceId, userId],
      );
      if (!device.rows[0])
        throw new HttpError(404, "DEVICE_NOT_FOUND", "设备不存在。");
      if (device.rows[0].status === "revoked") return [];
      await db.query(
        "UPDATE echo.devices SET status='revoked',revoked_at=now(),version=version+1 WHERE id=$1",
        [deviceId],
      );
      const removed = await db.query<{ id: string }>(
        "DELETE FROM echo.sessions WHERE device_id=$1 RETURNING id",
        [deviceId],
      );
      await db.query(
        "UPDATE echo.conversations SET status='frozen' WHERE status='active' AND id IN(SELECT conversation_id FROM echo.conversation_devices WHERE device_id=$1 AND left_seq IS NULL)",
        [deviceId],
      );
      await db.query(
        "INSERT INTO echo.security_events(user_id,kind) VALUES($1,'device-revoked')",
        [userId],
      );
      if (actor.audience === "admin")
        await db.query(
          "INSERT INTO echo.admin_audit_logs(actor_user_id,action,target_id) VALUES($1,'device-revoke',$2)",
          [actor.account.id, deviceId],
        );
      return removed.rows.map((row) => row.id);
    });
  }
}
