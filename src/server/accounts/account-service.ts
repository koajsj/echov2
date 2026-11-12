import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { Account } from "../../shared/contracts.js";
import { normalizeUsername } from "../../shared/validation.js";
import { lockUserSession } from "./session-access.js";
import { transaction } from "../storage/database.js";
import { HttpError } from "../api/http-error.js";
import { passwordHash, passwordMatches } from "./passwords.js";
export const tokenHash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
interface RegistrationRow extends Account {
  password_hash: string;
  registration_hash: string;
  status: string;
}
const registrationLookup =
  "SELECT id,username,password_hash,registration_hash,status,version::text FROM echo.users WHERE registration_id=$1";
export class AccountService {
  constructor(
    private readonly pool: Pool,
    private readonly dummyHash: string,
  ) {}
  async register(input: {
    operationId: string;
    username: string;
    password: string;
    invitation?: string;
  }): Promise<Account> {
    const normalized = normalizeUsername(input.username);
    const requestHash = tokenHash(
      JSON.stringify([normalized, input.invitation ?? null]),
    );
    const prior = await this.pool.query<RegistrationRow>(registrationLookup, [
      input.operationId,
    ]);
    const existing = prior.rows[0];
    if (existing)
      return this.registrationResult(existing, input.password, requestHash);
    const encoded = await passwordHash(input.password);
    const result = await transaction(this.pool, async (db) => {
      const settings = await db.query<{
        registration_mode: string;
      }>(
        "SELECT registration_mode FROM echo.site_settings WHERE singleton FOR UPDATE",
      );
      const concurrent = await db.query<RegistrationRow>(registrationLookup, [
        input.operationId,
      ]);
      if (concurrent.rows[0])
        return {
          existing: concurrent.rows[0],
          created: null,
        };
      const mode = settings.rows[0]?.registration_mode;
      if (mode !== "open" && mode !== "invite")
        throw new HttpError(403, "REGISTRATION_CLOSED", "当前未开放注册。");
      if (mode === "invite") {
        if (!input.invitation)
          throw new HttpError(403, "INVITATION_REQUIRED", "需要有效邀请码。");
        const invitation = await db.query(
          "UPDATE echo.invitations SET uses=uses+1 WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND uses<max_uses RETURNING id",
          [tokenHash(input.invitation)],
        );
        if (!invitation.rowCount)
          throw new HttpError(403, "INVITATION_INVALID", "邀请码不可用。");
      }
      const created = await db.query<Account>(
        "INSERT INTO echo.users(id,registration_id,registration_hash,username,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,username,version::text",
        [randomUUID(), input.operationId, requestHash, input.username, encoded],
      );
      return {
        existing: null,
        created: created.rows[0]!,
      };
    });
    return result.existing
      ? this.registrationResult(result.existing, input.password, requestHash)
      : result.created!;
  }
  private async registrationResult(
    row: RegistrationRow,
    password: string,
    requestHash: string,
  ): Promise<Account> {
    const matches = await passwordMatches(row.password_hash, password);
    if (!matches || row.registration_hash !== requestHash)
      throw new HttpError(
        409,
        "OPERATION_CONFLICT",
        "注册请求与原操作不一致。",
      );
    if (row.status !== "active")
      throw new HttpError(
        403,
        "ACCOUNT_UNAVAILABLE",
        "账号已创建但当前不可用。",
      );
    return {
      id: row.id,
      username: row.username,
      version: row.version,
    };
  }
  async authenticate(
    identity: { username: string } | { userId: string },
    password: string,
    ip: string,
  ): Promise<Account> {
    const result = await this.pool.query<{
      id: string;
      username: string;
      version: string;
      status: string;
      password_hash: string;
    }>(
      "userId" in identity
        ? "SELECT id,username,version::text,status,password_hash FROM echo.users WHERE id=$1"
        : "SELECT id,username,version::text,status,password_hash FROM echo.users WHERE username_normalized=$1",
      [
        "userId" in identity
          ? identity.userId
          : normalizeUsername(identity.username),
      ],
    );
    const user = result.rows[0];
    const matches = await passwordMatches(
      user?.password_hash ?? this.dummyHash,
      password,
    );
    const accepted = !!user && matches && user.status === "active";
    await this.pool.query(
      "INSERT INTO echo.security_events(user_id,kind,ip) VALUES($1,$2,$3)",
      [
        user?.id ?? null,
        "userId" in identity
          ? accepted
            ? "reauth-success"
            : "reauth-failure"
          : accepted
            ? "login-success"
            : "login-failure",
        ip,
      ],
    );
    if (!accepted || !user)
      throw new HttpError(
        401,
        "INVALID_CREDENTIALS",
        "账号或密码不正确，或账号不可用。",
      );
    return {
      id: user.id,
      username: user.username,
      version: user.version,
    };
  }
  async rename(
    userId: string,
    sessionId: string,
    username: string,
    version: string,
  ): Promise<Account> {
    normalizeUsername(username);
    return transaction(this.pool, async (db) => {
      await lockUserSession(db, userId, sessionId, {
        recent: true,
      });
      const result = await db.query<Account>(
        "UPDATE echo.users SET username=$2,version=version+1 WHERE id=$1 AND version=$3 AND status='active' RETURNING id,username,version::text",
        [userId, username, version],
      );
      if (!result.rows[0])
        throw new HttpError(
          409,
          "VERSION_CONFLICT",
          "账号状态已变化，请刷新。",
        );
      return result.rows[0];
    });
  }
}
