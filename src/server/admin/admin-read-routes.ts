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
        `SELECT id,public_id AS "publicId",username,status,version::text,created_at,
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
        `SELECT d.id,u.public_id AS user_public_id,u.username,d.label,d.status,d.created_at,d.revoked_at
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
            ? "SELECT a.id::text,u.public_id AS actor_public_id,a.action,coalesce(t.public_id,a.target_id::text) AS target_id,a.event_id::text,a.created_at FROM echo.admin_audit_logs a LEFT JOIN echo.users u ON u.id=a.actor_user_id LEFT JOIN echo.users t ON t.id=a.target_id WHERE ($1::bigint IS NULL OR a.id<$1) ORDER BY a.id DESC LIMIT 51"
            : `SELECT e.id::text,u.public_id AS user_public_id,e.kind,host(e.ip) AS ip,e.reviewed_at,r.public_id AS reviewer_public_id,e.created_at FROM echo.security_events e LEFT JOIN echo.users u ON u.id=e.user_id LEFT JOIN echo.users r ON r.id=e.reviewed_by WHERE ($1::bigint IS NULL OR e.id<$1) ${kind === "logins" ? "AND e.kind IN ('login-success','login-failure','reauth-success','reauth-failure')" : ""} ORDER BY e.id DESC LIMIT 51`;
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
  app.get<{ Querystring: { before?: string } }>(
    "/v1/admin/deletions",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { before: sequenceSchema },
        },
      },
    },
    async (request) => {
      await sessions.require(request, "admin");
      const result = await pool.query(
        "SELECT id::text,message_id,reason,state,created_at,completed_at FROM echo.deletion_records WHERE ($1::bigint IS NULL OR id<$1) ORDER BY id DESC LIMIT 51",
        [request.query.before ? sequence(request.query.before) : null],
      );
      return {
        items: result.rows.slice(0, 50),
        next: result.rows.length > 50 ? result.rows[49].id : null,
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
  app.get<{ Querystring: { days?: number } }>(
    "/v1/admin/trends",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { days: { type: "integer", enum: [7, 30, 90] } },
        },
      },
    },
    async (request) => {
      await sessions.require(request, "admin");
      const days = request.query.days ?? 30;
      const result = await pool.query(
        `WITH observed AS (
      SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS bucket,count(*)::int AS registrations,0::int AS deliveries
      FROM echo.users WHERE created_at>=(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-($1::int-1)*interval '1 day' GROUP BY 1
      UNION ALL
      SELECT to_char(received_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS bucket,0::int,count(*)::int
      FROM echo.messages WHERE received_at>=(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-($1::int-1)*interval '1 day' GROUP BY 1
    ) SELECT bucket,sum(registrations)::int AS registrations,sum(deliveries)::int AS deliveries FROM observed GROUP BY bucket ORDER BY bucket`,
        [days],
      );
      return {
        items: result.rows,
        source: "postgresql-users-created-at-and-messages-received-at",
        windowDays: days,
        trafficBytes: null,
      };
    },
  );
}
