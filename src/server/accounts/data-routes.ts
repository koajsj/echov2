import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { MetadataExport } from "../../shared/contracts.js";
import type { SessionService } from "./sessions.js";
import { lockUserSession } from "./session-access.js";
import { transaction } from "../storage/database.js";
import { HttpError } from "../api/http-error.js";

// Explicitly service metadata, never a history, private-key or system backup.
export function dataRoutes(
  app: FastifyInstance,
  pool: Pool,
  sessions: SessionService,
  origin: string,
): void {
  app.post(
    "/v1/account/export",
    { config: { rateLimit: { max: 2, timeWindow: 60000 } } },
    async (request) => {
      sessions.assertCsrf(request, "user");
      const current = await sessions.require(request, "user", true);
      return transaction(pool, async (db) => {
        await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await lockUserSession(db, current.account.id, current.id, {
          recent: true,
        });
        const account = await db.query<MetadataExport["account"]>(
          "SELECT id,username,version::text FROM echo.users WHERE id=$1",
          [current.account.id],
        );
        const devices = await db.query<
          Omit<MetadataExport["devices"][number], "createdAt"> & {
            createdAt: Date;
          }
        >(
          'SELECT id,label,status,created_at AS "createdAt" FROM echo.devices WHERE user_id=$1 ORDER BY id LIMIT 5001',
          [current.account.id],
        );
        const deletions = await db.query<
          Omit<MetadataExport["deletions"][number], "createdAt"> & {
            createdAt: Date;
          }
        >(
          `SELECT d.id::text,d.message_id AS "messageId",d.reason,d.state,d.created_at AS "createdAt"
        FROM echo.deletion_records d JOIN echo.messages m ON m.id=d.message_id WHERE m.sender_user_id=$1 ORDER BY d.id LIMIT 5001`,
          [current.account.id],
        );
        if (devices.rows.length > 5000 || deletions.rows.length > 5000)
          throw new HttpError(
            413,
            "EXPORT_LIMIT",
            "元数据超过单次导出范围；未生成截断归档。需要受审查的分页快照导出。",
          );
        const clock = await db.query<{ at: Date }>(
          "SELECT transaction_timestamp() AS at",
        );
        const result: MetadataExport = {
          version: 1,
          scope: "service-metadata-only",
          origin,
          issuedAt: clock.rows[0]!.at.toISOString(),
          account: account.rows[0]!,
          devices: devices.rows.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
          })),
          deletions: deletions.rows.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
          })),
        };
        if (Buffer.byteLength(JSON.stringify(result), "utf8") > 1024 * 1024)
          throw new HttpError(
            413,
            "EXPORT_LIMIT",
            "归档超过1 MiB；未生成截断归档。",
          );
        return result;
      });
    },
  );
}
