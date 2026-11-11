import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { Account, Audience, SessionView } from "../../shared/contracts.js";
import { transaction } from "../storage/database.js";
import { tokenHash } from "./account-service.js";
import { HttpError } from "../api/http-error.js";
import { randomUUID } from "node:crypto";
export interface AuthorizedSession extends SessionView {
  id: string;
  reauthenticatedAt: string;
}
export const cookieName = (audience: Audience): string =>
  `__Host-echo-${audience}`;
export const csrfName = (audience: Audience): string =>
  `__Host-echo-csrf-${audience}`;
const cookieOptions = {
  path: "/",
  secure: true,
  sameSite: "strict" as const,
};
export class SessionService {
  constructor(
    private readonly pool: Pool,
    private readonly origin: string,
  ) {}
  assertOrigin(request: FastifyRequest): void {
    if (request.headers.origin !== this.origin)
      throw new HttpError(403, "ORIGIN_DENIED", "请求来源不受信任。");
  }
  assertCsrf(request: FastifyRequest, audience: Audience): void {
    this.assertOrigin(request);
    const token = request.cookies[csrfName(audience)];
    if (!token || token !== request.headers["x-echo-csrf"])
      throw new HttpError(403, "CSRF_DENIED", "请刷新页面后重试。");
  }
  async create(
    reply: FastifyReply,
    account: Account,
    audience: Audience,
  ): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await transaction(this.pool, async (db) => {
      const user = await db.query(
        "SELECT id FROM echo.users WHERE id=$1 AND status='active' FOR UPDATE",
        [account.id],
      );
      if (!user.rowCount)
        throw new HttpError(401, "ACCOUNT_UNAVAILABLE", "账号状态已变化。");
      if (audience === "admin") {
        const admin = await db.query(
          "SELECT 1 FROM echo.site_settings WHERE singleton AND superadmin_user_id=$1",
          [account.id],
        );
        if (!admin.rowCount)
          throw new HttpError(403, "ADMIN_REQUIRED", "需要超级管理员权限。");
      }
      await db.query(
        "INSERT INTO echo.sessions(id,token_hash,user_id,audience,expires_at) VALUES($1,$2,$3,$4,now()+interval '12 hours')",
        [randomUUID(), tokenHash(token), account.id, audience],
      );
    });
    reply.setCookie(cookieName(audience), token, {
      ...cookieOptions,
      httpOnly: true,
      maxAge: 43200,
    });
    reply.setCookie(csrfName(audience), randomBytes(32).toString("base64url"), {
      ...cookieOptions,
      httpOnly: false,
      maxAge: 43200,
    });
  }
  async require(
    request: FastifyRequest,
    audience: Audience = "user",
    recent = false,
  ): Promise<AuthorizedSession> {
    const token = request.cookies[cookieName(audience)];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new HttpError(401, "SESSION_REQUIRED", "请登录。");
    const result = await this.pool.query<{
      id: string;
      user_id: string;
      username: string;
      version: string;
      device_id: string | null;
      reauthenticated_at: Date;
    }>(
      `SELECT s.id,s.user_id,u.username,u.version::text,s.device_id,s.reauthenticated_at
       FROM echo.sessions s JOIN echo.users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.audience=$2 AND s.expires_at>now() AND u.status='active'
       AND (s.device_id IS NULL OR EXISTS(SELECT 1 FROM echo.devices d WHERE d.id=s.device_id AND d.status<>'revoked'))
       AND ($2<>'admin' OR EXISTS(SELECT 1 FROM echo.site_settings x WHERE x.singleton AND x.superadmin_user_id=u.id))
       AND (NOT $3::boolean OR s.reauthenticated_at>now()-interval '5 minutes')`,
      [tokenHash(token), audience, recent],
    );
    const row = result.rows[0];
    if (!row)
      throw new HttpError(401, "SESSION_EXPIRED", "会话不可用或需要重新认证。");
    if (
      (!["GET", "HEAD"].includes(request.method) ||
        request.headers["x-echo-session"] !== undefined) &&
      request.headers["x-echo-session"] !== row.id
    )
      throw new HttpError(
        409,
        "SESSION_CHANGED",
        "会话已变化，请重新确认操作。",
      );
    return {
      id: row.id,
      sessionId: row.id,
      audience,
      deviceId: row.device_id,
      account: {
        id: row.user_id,
        username: row.username,
        version: row.version,
      },
      reauthenticatedAt: row.reauthenticated_at.toISOString(),
    };
  }
  async revoke(
    request: FastifyRequest,
    reply: FastifyReply,
    audience: Audience,
  ): Promise<string | null> {
    const token = request.cookies[cookieName(audience)];
    const result = token
      ? await this.pool.query<{
          id: string;
        }>(
          "DELETE FROM echo.sessions WHERE token_hash=$1 AND audience=$2 RETURNING id",
          [tokenHash(token), audience],
        )
      : null;
    reply
      .clearCookie(cookieName(audience), cookieOptions)
      .clearCookie(csrfName(audience), cookieOptions);
    return result?.rows[0]?.id ?? null;
  }
  async pruneExpired(): Promise<void> {
    await this.pool.query(`DELETE FROM echo.sessions WHERE id IN (
      SELECT id FROM echo.sessions WHERE expires_at<=clock_timestamp()
      ORDER BY expires_at,id LIMIT 100 FOR UPDATE SKIP LOCKED)`);
  }
  async requireActiveDevice(session: AuthorizedSession): Promise<string> {
    if (!session.deviceId)
      throw new HttpError(403, "TRUSTED_DEVICE_REQUIRED", "需要可信设备。");
    const device = await this.pool.query(
      "SELECT 1 FROM echo.devices d WHERE d.id=$1 AND d.user_id=$2 AND d.status='active' AND EXISTS(SELECT 1 FROM echo.device_credentials c JOIN echo.account_identity_keys k ON k.user_id=c.user_id AND k.version=c.root_version WHERE c.device_id=d.id AND c.revoked_at IS NULL AND c.expires_at>now() AND k.retired_at IS NULL)",
      [session.deviceId, session.account.id],
    );
    if (!device.rowCount)
      throw new HttpError(403, "TRUSTED_DEVICE_REQUIRED", "设备授权尚未完成。");
    return session.deviceId;
  }
}
