import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { SessionService } from "../accounts/sessions.js";
import { uuidSchema, sequenceSchema } from "../../shared/validation.js";
import { sequence } from "../delivery/delivery-service.js";
import { HttpError } from "../api/http-error.js";
const uuidPage = {
  type: "object",
  additionalProperties: false,
  properties: {
    after: uuidSchema,
    userId: uuidSchema,
  },
};
export function adminReadRoutes(
  app: FastifyInstance,
  pool: Pool,
  sessions: SessionService,
): void {
  app.get<{
    Params: {
      id: string;
    };
  }>(
    "/v1/admin/users/:id",
    {
      schema: {
        params: {
          type: "object",
          additionalProperties: false,
          required: ["id"],
          properties: {
            id: uuidSchema,
          },
        },
      },
    },
    async (request) => {
      await sessions.require(request, "admin");
      const result = await pool.query(
        `SELECT id,username,status,version::text,created_at,
      (SELECT count(*)::text FROM echo.devices d WHERE d.user_id=u.id) AS device_count,
      (SELECT count(*)::text FROM echo.sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS active_sessions
      FROM echo.users u WHERE id=$1`,
        [request.params.id],
      );
      if (!result.rows[0])
        throw new HttpError(404, "USER_NOT_FOUND", "用户不存在。");
      return result.rows[0];
    },
  );
  app.get<{
    Querystring: {
      after?: string;
      userId?: string;
    };
  }>(
    "/v1/admin/devices",
    {
      schema: {
        querystring: uuidPage,
      },
    },
    async (request) => {
      await sessions.require(request, "admin");
      const result = await pool.query(
        `SELECT d.id,d.user_id,u.username,d.label,d.status,d.created_at,d.revoked_at
      FROM echo.devices d JOIN echo.users u ON u.id=d.user_id
      WHERE ($1::uuid IS NULL OR d.id>$1) AND ($2::uuid IS NULL OR d.user_id=$2) ORDER BY d.id LIMIT 51`,
        [request.query.after ?? null, request.query.userId ?? null],
      );
      return {
        items: result.rows.slice(0, 50),
        next: result.rows.length > 50 ? result.rows[49].id : null,
      };
    },
  );
  for (const kind of ["security", "logins", "audit"] as const) {
    app.get<{
      Querystring: {
        before?: string;
      };
    }>(
      `/v1/admin/${kind}`,
      {
        schema: {
          querystring: {
            type: "object",
            additionalProperties: false,
            properties: {
              before: sequenceSchema,
            },
          },
        },
      },
      async (request) => {
        await sessions.require(request, "admin");
        const before = request.query.before
          ? sequence(request.query.before)
          : null;
        // The table/columns/predicate are code constants, never request-controlled SQL.
        const sql =
          kind === "audit"
            ? "SELECT id::text,actor_user_id,action,target_id,created_at FROM echo.admin_audit_logs WHERE ($1::bigint IS NULL OR id<$1) ORDER BY id DESC LIMIT 51"
            : `SELECT id::text,user_id,kind,host(ip) AS ip,created_at FROM echo.security_events WHERE ($1::bigint IS NULL OR id<$1) ${kind === "logins" ? "AND kind IN ('login-success','login-failure')" : ""} ORDER BY id DESC LIMIT 51`;
        const result = await pool.query(sql, [before]);
        return {
          items: result.rows.slice(0, 50),
          next: result.rows.length > 50 ? result.rows[49].id : null,
          source:
            kind === "audit"
              ? "admin-audit-log"
              : "authentication-and-device-handlers",
          region: null,
          browser: null,
        };
      },
    );
  }
  app.get<{
    Querystring: {
      after?: string;
    };
  }>(
    "/v1/admin/invitations",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            after: uuidSchema,
          },
        },
      },
    },
    async (request) => {
      await sessions.require(request, "admin");
      const result = await pool.query(
        "SELECT id,max_uses,uses,expires_at,revoked_at,created_at FROM echo.invitations WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 51",
        [request.query.after ?? null],
      );
      return {
        items: result.rows.slice(0, 50),
        next: result.rows.length > 50 ? result.rows[49].id : null,
      };
    },
  );
  app.get<{
    Querystring: {
      after?: string;
    };
  }>(
    "/v1/admin/backups",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            after: uuidSchema,
          },
        },
      },
    },
    async (request) => {
      await sessions.require(request, "admin");
      const result = await pool.query(
        "SELECT id,state,created_at,verified_at FROM echo.backup_records WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT 51",
        [request.query.after ?? null],
      );
      return {
        items: result.rows.slice(0, 50),
        next: result.rows.length > 50 ? result.rows[49].id : null,
        executor: "BLOCKED",
      };
    },
  );
  app.get("/v1/admin/growth", async (request) => {
    await sessions.require(request, "admin");
    const result =
      await pool.query(`SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS bucket,count(*)::int AS value
      FROM echo.users WHERE created_at>=(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '29 days'
      GROUP BY 1 ORDER BY 1`);
    return {
      items: result.rows,
      source: "account-created-at",
      window: "30 UTC days; observed buckets only",
      trafficBytes: null,
      regions: null,
    };
  });
}
