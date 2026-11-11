import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { SessionService } from "../accounts/sessions.js";
import { lockUserSession } from "../accounts/session-access.js";
import type { DeviceService } from "../devices/device-service.js";
import type { ConnectionHub } from "../delivery/connection-hub.js";
import { transaction } from "../storage/database.js";
import { uuidSchema, sequenceSchema } from "../../shared/validation.js";
import { sequence } from "../delivery/delivery-service.js";
import { HttpError } from "../api/http-error.js";

export function adminActionRoutes(
  app: FastifyInstance,
  pool: Pool,
  sessions: SessionService,
  devices: DeviceService,
  hub: ConnectionHub,
): void {
  const params = (id: object) => ({
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id },
  });
  app.post<{ Params: { id: string } }>(
    "/v1/admin/devices/:id/revoke",
    { schema: { params: params(uuidSchema) } },
    async (request) => {
      sessions.assertCsrf(request, "admin");
      const current = await sessions.require(request, "admin", true);
      const ids = await devices.revoke(current, request.params.id);
      for (const id of ids) hub.closeSession(id);
      return { serviceAccessRevoked: true, cryptographicRemoval: "BLOCKED" };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/admin/invitations/:id/revoke",
    { schema: { params: params(uuidSchema) } },
    async (request) => {
      sessions.assertCsrf(request, "admin");
      const current = await sessions.require(request, "admin", true);
      return transaction(pool, async (db) => {
        await lockUserSession(db, current.account.id, current.id, {
          audience: "admin",
          recent: true,
        });
        const row = await db.query<{ revoked_at: Date | null }>(
          "SELECT revoked_at FROM echo.invitations WHERE id=$1 FOR UPDATE",
          [request.params.id],
        );
        if (!row.rows[0])
          throw new HttpError(404, "INVITATION_NOT_FOUND", "邀请码不存在。");
        if (!row.rows[0].revoked_at) {
          await db.query(
            "UPDATE echo.invitations SET revoked_at=clock_timestamp() WHERE id=$1",
            [request.params.id],
          );
          await db.query(
            "INSERT INTO echo.admin_audit_logs(actor_user_id,action,target_id) VALUES($1,'invitation-revoke',$2)",
            [current.account.id, request.params.id],
          );
        }
        return { revoked: true };
      });
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/admin/security/:id/review",
    { schema: { params: params(sequenceSchema) } },
    async (request) => {
      sessions.assertCsrf(request, "admin");
      const current = await sessions.require(request, "admin", true);
      const id = sequence(request.params.id);
      return transaction(pool, async (db) => {
        await lockUserSession(db, current.account.id, current.id, {
          audience: "admin",
          recent: true,
        });
        const row = await db.query<{ reviewed_at: Date | null }>(
          "SELECT reviewed_at FROM echo.security_events WHERE id=$1 FOR UPDATE",
          [id],
        );
        if (!row.rows[0])
          throw new HttpError(404, "EVENT_NOT_FOUND", "事件不存在。");
        if (!row.rows[0].reviewed_at) {
          await db.query(
            "UPDATE echo.security_events SET reviewed_at=clock_timestamp(),reviewed_by=$2 WHERE id=$1",
            [id, current.account.id],
          );
          // Audit target_id is UUID; use a structured numeric reference column, not a cast to UUID.
          await db.query(
            "INSERT INTO echo.admin_audit_logs(actor_user_id,action,event_id) VALUES($1,'security-review',$2)",
            [current.account.id, id],
          );
        }
        return { reviewed: true, resolved: false };
      });
    },
  );
}
