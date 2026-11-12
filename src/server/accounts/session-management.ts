import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { SessionService, AuthorizedSession } from "./sessions.js";
import type { ConnectionHub } from "../delivery/connection-hub.js";
import { transaction } from "../storage/database.js";
import { lockUserSession } from "./session-access.js";
import { uuidSchema } from "../../shared/validation.js";
import { HttpError } from "../api/http-error.js";

export function sessionManagementRoutes(
  app: FastifyInstance,
  pool: Pool,
  sessions: SessionService,
  hub: ConnectionHub,
): void {
  async function list(
    userId: string,
    after: string | null,
    currentId: string,
    audience: "user" | "admin",
  ) {
    const rows = await pool.query(
      `SELECT id,audience,device_id,created_at,expires_at,id=$3::uuid AS current
      FROM echo.sessions WHERE user_id=$1 AND expires_at>clock_timestamp() AND ($4='admin' OR audience='user')
      AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 51`,
      [userId, after, currentId, audience],
    );
    return {
      items: rows.rows.slice(0, 50),
      next: rows.rows.length > 50 ? rows.rows[49].id : null,
    };
  }
  async function revoke(
    actor: AuthorizedSession,
    userId: string,
    targetId: string | null,
  ) {
    if (actor.audience === "admin" && userId === actor.account.id)
      throw new HttpError(
        409,
        "ADMIN_SELF_REVOKE",
        "请通过当前管理员会话登出；此入口不撤销自身全部会话。",
      );
    const count = await transaction(pool, async (db) => {
      await lockUserSession(db, actor.account.id, actor.id, {
        audience: actor.audience,
        recent: true,
      });
      if (actor.account.id !== userId) {
        const target = await db.query(
          "SELECT id FROM echo.users WHERE id=$1 FOR UPDATE",
          [userId],
        );
        if (!target.rowCount)
          throw new HttpError(404, "USER_NOT_FOUND", "用户不存在。");
      }
      const removed = await db.query<{ id: string }>(
        `DELETE FROM echo.sessions WHERE user_id=$1
        AND id<>$2 AND ($3::uuid IS NULL OR id=$3) AND ($4='admin' OR audience='user') RETURNING id`,
        [userId, actor.id, targetId, actor.audience],
      );
      if (removed.rowCount) {
        if (actor.audience === "admin")
          await db.query(
            "INSERT INTO echo.admin_audit_logs(actor_user_id,action,target_id) VALUES($1,'sessions-revoke',$2)",
            [actor.account.id, userId],
          );
        else
          await db.query(
            "INSERT INTO echo.security_events(user_id,kind) VALUES($1,'sessions-revoked')",
            [userId],
          );
      }
      return removed.rows;
    });
    for (const row of count) hub.closeSession(row.id);
    return {
      revoked: count.length,
      scope: "server-sessions-only",
      cryptographicRemoval: "BLOCKED",
    };
  }
  const query = {
    type: "object",
    additionalProperties: false,
    properties: { after: uuidSchema },
  };
  app.get<{ Querystring: { after?: string } }>(
    "/v1/account/sessions",
    { schema: { querystring: query } },
    async (request) => {
      const current = await sessions.require(request);
      return list(
        current.account.id,
        request.query.after ?? null,
        current.id,
        current.audience,
      );
    },
  );
  app.post<{ Body: { sessionId: string | null } }>(
    "/v1/account/sessions/revoke",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["sessionId"],
          properties: { sessionId: { anyOf: [uuidSchema, { type: "null" }] } },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request, "user", true);
      if (request.body.sessionId === current.id)
        throw new HttpError(409, "USE_LOGOUT", "当前会话请使用登出。");
      return revoke(current, current.account.id, request.body.sessionId);
    },
  );
  const params = {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: uuidSchema },
  };
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/v1/admin/users/:id/sessions",
    { schema: { params, querystring: query } },
    async (request) => {
      const current = await sessions.require(request, "admin");
      const target = await pool.query("SELECT id FROM echo.users WHERE id=$1", [
        request.params.id,
      ]);
      if (!target.rowCount)
        throw new HttpError(404, "USER_NOT_FOUND", "用户不存在。");
      return list(
        request.params.id,
        request.query.after ?? null,
        current.id,
        current.audience,
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/admin/users/:id/sessions/revoke",
    { schema: { params } },
    async (request) => {
      sessions.assertCsrf(request, "admin");
      return revoke(
        await sessions.require(request, "admin", true),
        request.params.id,
        null,
      );
    },
  );
}
