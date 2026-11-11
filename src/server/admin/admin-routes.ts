import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { SessionService } from "../accounts/sessions.js";
import type { ConnectionHub } from "../delivery/connection-hub.js";
import { tokenHash } from "../accounts/account-service.js";
import { lockUserSession } from "../accounts/session-access.js";
import { transaction } from "../storage/database.js";
import { uuidSchema } from "../../shared/validation.js";
import { HttpError } from "../api/http-error.js";
export function adminRoutes(
  app: FastifyInstance,
  pool: Pool,
  sessions: SessionService,
  hub: ConnectionHub,
): void {
  app.get<{
    Querystring: {
      after?: string;
      username?: string;
    };
  }>(
    "/v1/admin/users",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            after: uuidSchema,
            username: { type: "string", pattern: "^[a-zA-Z0-9_]{3,32}$" },
          },
        },
      },
    },
    async (request) => {
      await sessions.require(request, "admin");
      const result = await pool.query(
        'SELECT id,username,status,created_at FROM echo.users WHERE ($1::uuid IS NULL OR id>$1) AND ($2::text IS NULL OR username_normalized=lower($2 COLLATE "C")) ORDER BY id LIMIT 51',
        [request.query.after ?? null, request.query.username ?? null],
      );
      return {
        items: result.rows.slice(0, 50),
        next:
          result.rows.length > 50
            ? (
                result.rows[49] as {
                  id: string;
                }
              ).id
            : null,
      };
    },
  );
  app.get("/v1/admin/overview", async (request) => {
    await sessions.require(request, "admin");
    const result =
      await pool.query(`SELECT (SELECT count(*)::text FROM echo.users) AS users,
      (SELECT count(*)::text FROM echo.devices WHERE status='active') AS devices,
      (SELECT count(*)::text FROM echo.users WHERE created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) AS new_users_today,
      (SELECT count(DISTINCT s.user_id)::text FROM echo.sessions s JOIN echo.users u ON u.id=s.user_id WHERE s.expires_at>clock_timestamp() AND u.status='active' AND (s.device_id IS NULL OR EXISTS(SELECT 1 FROM echo.devices d WHERE d.id=s.device_id AND d.status<>'revoked'))) AS accounts_with_sessions,
      (SELECT coalesce(sum(ciphertext_bytes),0)::text FROM echo.attachments WHERE status<>'deleted') AS registered_attachment_bytes,
      (SELECT count(*)::text FROM echo.messages) AS accepted_envelopes,
      (SELECT count(*)::text FROM echo.deletion_records WHERE state<>'complete') AS pending_deletions`);
    const settings = await pool.query(
      "SELECT registration_mode,version::text FROM echo.site_settings WHERE singleton",
    );
    return {
      counts: result.rows[0],
      registration: settings.rows[0],
      trafficBytes: null,
      regions: null,
      source: "postgresql-business-metadata",
      cryptoVerifiedMessages: null,
      onlineDevices: null,
      onlineNotificationSessions: hub.onlineSessions(),
    };
  });
  app.patch<{
    Body: {
      mode: "open" | "invite" | "closed";
      version: string;
    };
  }>(
    "/v1/admin/registration",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["mode", "version"],
          properties: {
            mode: {
              type: "string",
              enum: ["open", "invite", "closed"],
            },
            version: {
              type: "string",
              pattern: "^[1-9][0-9]{0,17}$",
            },
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "admin");
      const current = await sessions.require(request, "admin", true);
      return transaction(pool, async (db) => {
        await lockUserSession(db, current.account.id, current.id, {
          audience: "admin",
          recent: true,
        });
        const result = await db.query(
          "UPDATE echo.site_settings SET registration_mode=$1,version=version+1 WHERE singleton AND version=$2 RETURNING registration_mode,version::text",
          [request.body.mode, request.body.version],
        );
        if (!result.rows[0])
          throw new HttpError(409, "VERSION_CONFLICT", "设置已变更，请刷新。");
        await db.query(
          "INSERT INTO echo.admin_audit_logs(actor_user_id,action) VALUES($1,'registration-change')",
          [current.account.id],
        );
        return result.rows[0];
      });
    },
  );
  app.post<{
    Body: {
      operationId: string;
      maxUses: number;
      validHours: number;
    };
  }>(
    "/v1/admin/invitations",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["operationId", "maxUses", "validHours"],
          properties: {
            operationId: uuidSchema,
            maxUses: {
              type: "integer",
              minimum: 1,
              maximum: 100,
            },
            validHours: {
              type: "integer",
              minimum: 1,
              maximum: 720,
            },
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "admin");
      const current = await sessions.require(request, "admin", true);
      const token = randomBytes(32).toString("base64url");
      const id = randomUUID();
      const hash = tokenHash(
        JSON.stringify([request.body.maxUses, request.body.validHours]),
      );
      return transaction(pool, async (db) => {
        await lockUserSession(db, current.account.id, current.id, {
          audience: "admin",
          recent: true,
        });
        const prior = await db.query<{
          id: string;
          created_by: string;
          request_hash: string;
        }>(
          "SELECT id,created_by,request_hash FROM echo.invitations WHERE operation_id=$1",
          [request.body.operationId],
        );
        if (prior.rows[0]) {
          if (
            prior.rows[0].created_by !== current.account.id ||
            prior.rows[0].request_hash !== hash
          )
            throw new HttpError(
              409,
              "OPERATION_CONFLICT",
              "邀请码操作内容不一致。",
            );
          return {
            id: prior.rows[0].id,
            token: null,
            displayOnce: true,
            replayed: true,
            tokenUnavailable: true,
          };
        }
        await db.query(
          "INSERT INTO echo.invitations(id,token_hash,max_uses,expires_at,created_by,operation_id,request_hash) VALUES($1,$2,$3,now()+$4*interval '1 hour',$5,$6,$7)",
          [
            id,
            tokenHash(token),
            request.body.maxUses,
            request.body.validHours,
            current.account.id,
            request.body.operationId,
            hash,
          ],
        );
        await db.query(
          "INSERT INTO echo.admin_audit_logs(actor_user_id,action,target_id) VALUES($1,'invitation-create',$2)",
          [current.account.id, id],
        );
        return {
          id,
          token,
          displayOnce: true,
          replayed: false,
          tokenUnavailable: false,
        };
      });
    },
  );
  app.post<{
    Params: {
      id: string;
    };
    Body: {
      suspended: boolean;
    };
  }>(
    "/v1/admin/users/:id/status",
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
        body: {
          type: "object",
          additionalProperties: false,
          required: ["suspended"],
          properties: {
            suspended: {
              type: "boolean",
            },
          },
        },
      },
    },
    async (request) => {
      sessions.assertCsrf(request, "admin");
      const current = await sessions.require(request, "admin", true);
      if (request.params.id === current.account.id)
        throw new HttpError(
          409,
          "ADMIN_SELF_SUSPEND",
          "不能在此停用超级管理员。",
        );
      const ids = await transaction(pool, async (db) => {
        await lockUserSession(db, current.account.id, current.id, {
          audience: "admin",
          recent: true,
        });
        const result = await db.query(
          "UPDATE echo.users SET status=$2,version=version+1 WHERE id=$1 AND status IN ('active','suspended') RETURNING id",
          [request.params.id, request.body.suspended ? "suspended" : "active"],
        );
        if (!result.rowCount)
          throw new HttpError(404, "USER_NOT_FOUND", "用户不存在或不可修改。");
        const removed = request.body.suspended
          ? await db.query<{
              id: string;
            }>("DELETE FROM echo.sessions WHERE user_id=$1 RETURNING id", [
              request.params.id,
            ])
          : {
              rows: [],
            };
        if (request.body.suspended)
          await db.query(
            "UPDATE echo.conversations SET status='frozen' WHERE status='active' AND id IN(SELECT conversation_id FROM echo.conversation_members WHERE user_id=$1 AND active)",
            [request.params.id],
          );
        await db.query(
          "INSERT INTO echo.admin_audit_logs(actor_user_id,action,target_id) VALUES($1,$2,$3)",
          [
            current.account.id,
            request.body.suspended ? "user-suspend" : "user-resume",
            request.params.id,
          ],
        );
        return removed.rows.map((row) => row.id);
      });
      for (const id of ids) hub.closeSession(id);
      return {
        updated: true,
        cryptographicRemoval: "BLOCKED",
      };
    },
  );
}
