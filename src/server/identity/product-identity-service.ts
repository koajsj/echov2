import { createPublicKey, randomBytes, verify } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AuthorizedSession } from "../accounts/sessions.js";
import { transaction } from "../storage/database.js";
import { lockUserSession } from "../accounts/session-access.js";
import { HttpError } from "../api/http-error.js";
import {
  credentialText,
  rootText,
  signatureHex,
  sessionBindingText,
} from "../../shared/crypto-identity.js";
import type {
  IdentityChallenge,
  IdentitySessionChallenge,
  IdentitySnapshot,
  SignedAuthorization,
  SignedRoot,
} from "../../shared/crypto-identity.js";

function fail(code: string): never {
  throw new HttpError(
    409,
    code,
    "身份验证未完成，请核对本机密钥、授权请求与公开记录。",
  );
}
function checkSignature(key: string, signature: string, message: string): void {
  if (!signatureHex.test(signature)) fail("INVALID_SIGNATURE");
  const publicKey = createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(key, "hex"),
    ]),
    format: "der",
    type: "spki",
  });
  if (
    !verify(
      null,
      Buffer.from(message),
      publicKey,
      Buffer.from(signature, "hex"),
    )
  )
    fail("INVALID_SIGNATURE");
}
export class ProductIdentityService {
  constructor(
    private readonly pool: Pool,
    private readonly origin: string,
  ) {}
  async snapshot(userId: string): Promise<IdentitySnapshot> {
    const root = await this.pool.query<{
      statement: SignedRoot["statement"];
      signature: Buffer;
    }>("SELECT statement,signature FROM echo.identity_roots WHERE user_id=$1", [
      userId,
    ]);
    const records = await this.pool.query<{
      credential: SignedAuthorization["credential"];
      device_signature: Buffer;
      root_signature: Buffer;
      state: "authorized" | "revoked" | "expired";
    }>(
      `SELECT a.credential,a.device_signature,a.root_signature,
        CASE WHEN a.revoked_at IS NOT NULL OR d.status='revoked' THEN 'revoked'
        WHEN a.expires_at<=clock_timestamp() THEN 'expired' ELSE 'authorized' END AS state
        FROM echo.identity_authorizations a JOIN echo.devices d ON d.id=a.device_id
        WHERE a.user_id=$1 ORDER BY a.device_id LIMIT 100`,
      [userId],
    );
    const row = root.rows[0];
    return {
      root: row
        ? { statement: row.statement, signature: row.signature.toString("hex") }
        : null,
      authorizations: records.rows.map((r) => ({
        authorization: {
          credential: r.credential,
          deviceSignature: r.device_signature.toString("hex"),
          rootSignature: r.root_signature.toString("hex"),
        },
        state: r.state,
      })),
      communication: "BLOCKED",
    };
  }
  async challenge(
    actor: AuthorizedSession,
    id: string,
    devicePublicKey: string,
  ): Promise<IdentityChallenge> {
    return transaction(this.pool, async (db) => {
      const session = await lockUserSession(db, actor.account.id, actor.id, {
        recent: true,
      });
      if (!session.deviceId) fail("DEVICE_REGISTRATION_REQUIRED");
      const device = await db.query(
        "SELECT id FROM echo.devices WHERE id=$1 AND user_id=$2 AND status='pending' FOR UPDATE",
        [session.deviceId, actor.account.id],
      );
      if (!device.rowCount) fail("PENDING_DEVICE_REQUIRED");
      const prior = await db.query<{ statement: IdentityChallenge }>(
        "SELECT statement FROM echo.identity_challenges WHERE id=$1",
        [id],
      );
      if (prior.rows[0]) {
        const c = prior.rows[0].statement;
        if (
          c.accountId !== actor.account.id ||
          c.deviceId !== session.deviceId ||
          c.devicePublicKey !== devicePublicKey
        )
          fail("OPERATION_CONFLICT");
        return c;
      }
      await db.query(
        "INSERT INTO echo.identity_device_keys(user_id,device_id,public_key) VALUES($1,$2,$3) ON CONFLICT(device_id) DO NOTHING",
        [
          actor.account.id,
          session.deviceId,
          Buffer.from(devicePublicKey, "hex"),
        ],
      );
      const bound = await db.query<{ public_key: Buffer }>(
        "SELECT public_key FROM echo.identity_device_keys WHERE device_id=$1",
        [session.deviceId],
      );
      if (bound.rows[0]?.public_key.toString("hex") !== devicePublicKey)
        fail("DEVICE_KEY_REPLACEMENT");
      const count = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM echo.identity_challenges WHERE device_id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp()",
        [session.deviceId],
      );
      if (count.rows[0]!.n >= 5) fail("CHALLENGE_LIMIT");
      const time = (
        await db.query<{ t: Date }>("SELECT clock_timestamp() AS t")
      ).rows[0]!.t.getTime();
      const c: IdentityChallenge = {
        id,
        origin: this.origin,
        accountId: actor.account.id,
        publicId: actor.account.publicId,
        deviceId: session.deviceId,
        devicePublicKey,
        nonce: randomBytes(32).toString("hex"),
        issuedAt: new Date(time).toISOString(),
        expiresAt: new Date(time + 300_000).toISOString(),
        credentialExpiresAt: new Date(time + 30 * 86_400_000).toISOString(),
      };
      await db.query(
        "INSERT INTO echo.identity_challenges(id,user_id,device_id,statement,expires_at) VALUES($1,$2,$3,$4,$5)",
        [id, actor.account.id, session.deviceId, c, c.expiresAt],
      );
      return c;
    });
  }
  async authorize(
    actor: AuthorizedSession,
    authorization: SignedAuthorization,
    root?: SignedRoot,
  ): Promise<{ state: "authorized"; communication: "BLOCKED" }> {
    let canonical: string;
    try {
      canonical = credentialText(authorization.credential);
      if (root) rootText(root.statement);
    } catch {
      fail("INVALID_IDENTITY_STATEMENT");
    }
    const c = authorization.credential.challenge;
    if (
      c.accountId !== actor.account.id ||
      c.publicId !== actor.account.publicId ||
      c.origin !== this.origin
    )
      fail("IDENTITY_SCOPE_MISMATCH");
    checkSignature(c.devicePublicKey, authorization.deviceSignature, canonical);
    checkSignature(
      authorization.credential.rootPublicKey,
      authorization.rootSignature,
      canonical,
    );
    if (root) {
      const r = root.statement;
      if (
        r.accountId !== c.accountId ||
        r.publicId !== c.publicId ||
        r.origin !== c.origin ||
        r.deviceId !== c.deviceId ||
        r.challengeId !== c.id ||
        r.publicKey !== authorization.credential.rootPublicKey
      )
        fail("ROOT_BINDING_MISMATCH");
      checkSignature(r.publicKey, root.signature, rootText(r));
    }
    return transaction(this.pool, async (db) => {
      const session = await lockUserSession(db, actor.account.id, actor.id, {
        recent: true,
      });
      const target = await db.query<{ status: string }>(
        "SELECT status FROM echo.devices WHERE user_id=$1 AND id=$2 FOR UPDATE",
        [actor.account.id, c.deviceId],
      );
      if (target.rows[0]?.status !== "pending") fail("PENDING_DEVICE_REQUIRED");
      const current = await db.query<{
        statement: SignedRoot["statement"];
        signature: Buffer;
      }>(
        "SELECT statement,signature FROM echo.identity_roots WHERE user_id=$1",
        [actor.account.id],
      );
      if (root) {
        if (session.deviceId !== c.deviceId) fail("DEVICE_SESSION_MISMATCH");
        if (
          current.rows[0] &&
          (rootText(current.rows[0].statement) !== rootText(root.statement) ||
            current.rows[0].signature.toString("hex") !== root.signature)
        )
          fail("ROOT_ALREADY_PINNED");
      } else {
        if (
          !current.rows[0] ||
          current.rows[0].statement.publicKey !==
            authorization.credential.rootPublicKey
        )
          fail("ROOT_NOT_REGISTERED");
        // Authorizing session must already have a live, signed device authorization.
        await this.requireAuthorized(db, actor.account.id, session.deviceId);
      }
      const existing = await db.query<{
        credential: SignedAuthorization["credential"];
        device_signature: Buffer;
        root_signature: Buffer;
        valid: boolean;
      }>(
        "SELECT credential,device_signature,root_signature,revoked_at IS NULL AND expires_at>clock_timestamp() AS valid FROM echo.identity_authorizations WHERE device_id=$1",
        [c.deviceId],
      );
      if (existing.rows[0]) {
        const e = existing.rows[0];
        if (
          !e.valid ||
          credentialText(e.credential) !== canonical ||
          e.device_signature.toString("hex") !==
            authorization.deviceSignature ||
          e.root_signature.toString("hex") !== authorization.rootSignature
        )
          fail("OPERATION_CONFLICT");
        return { state: "authorized", communication: "BLOCKED" };
      }
      const pending = await db.query<{ statement: IdentityChallenge }>(
        "SELECT statement FROM echo.identity_challenges WHERE id=$1 AND user_id=$2 AND device_id=$3 AND consumed_at IS NULL FOR UPDATE",
        [c.id, actor.account.id, c.deviceId],
      );
      if (
        !pending.rows[0] ||
        credentialText({
          ...authorization.credential,
          challenge: pending.rows[0].statement,
        }) !== canonical
      )
        fail("CHALLENGE_MISMATCH");
      if (
        !(
          await db.query(
            "SELECT 1 FROM echo.identity_challenges WHERE id=$1 AND expires_at>clock_timestamp()",
            [c.id],
          )
        ).rowCount
      )
        fail("CHALLENGE_EXPIRED");
      if (root && !current.rows[0])
        await db.query(
          "INSERT INTO echo.identity_roots(user_id,version,public_key,statement,signature) VALUES($1,1,$2,$3,$4)",
          [
            actor.account.id,
            Buffer.from(root.statement.publicKey, "hex"),
            root.statement,
            Buffer.from(root.signature, "hex"),
          ],
        );
      await db.query(
        "INSERT INTO echo.identity_authorizations(device_id,user_id,challenge_id,credential,device_signature,root_signature,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          c.deviceId,
          actor.account.id,
          c.id,
          authorization.credential,
          Buffer.from(authorization.deviceSignature, "hex"),
          Buffer.from(authorization.rootSignature, "hex"),
          c.credentialExpiresAt,
        ],
      );
      await db.query(
        "UPDATE echo.identity_challenges SET consumed_at=clock_timestamp() WHERE id=$1",
        [c.id],
      );
      await db.query(
        "INSERT INTO echo.security_events(user_id,kind) VALUES($1,$2)",
        [
          actor.account.id,
          root ? "identity-root-initialized" : "identity-device-authorized",
        ],
      );
      return { state: "authorized", communication: "BLOCKED" };
    });
  }
  async sessionChallenge(
    actor: AuthorizedSession,
    id: string,
    deviceId: string,
  ): Promise<IdentitySessionChallenge> {
    return transaction(this.pool, async (db) => {
      const session = await lockUserSession(db, actor.account.id, actor.id, {
        recent: true,
      });
      if (session.deviceId && session.deviceId !== deviceId)
        fail("DEVICE_ALREADY_BOUND");
      await this.requireAuthorized(db, actor.account.id, deviceId);
      const prior = await db.query<{ statement: IdentitySessionChallenge }>(
        "SELECT statement FROM echo.identity_session_challenges WHERE id=$1",
        [id],
      );
      if (prior.rows[0]) {
        const c = prior.rows[0].statement;
        if (
          c.accountId !== actor.account.id ||
          c.sessionId !== actor.id ||
          c.deviceId !== deviceId
        )
          fail("OPERATION_CONFLICT");
        return c;
      }
      const count = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM echo.identity_session_challenges WHERE session_id=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp()",
        [actor.id],
      );
      if (count.rows[0]!.n >= 5) fail("CHALLENGE_LIMIT");
      const time = (
        await db.query<{ t: Date }>("SELECT clock_timestamp() AS t")
      ).rows[0]!.t.getTime();
      const c: IdentitySessionChallenge = {
        id,
        origin: this.origin,
        accountId: actor.account.id,
        publicId: actor.account.publicId,
        deviceId,
        sessionId: actor.id,
        nonce: randomBytes(32).toString("hex"),
        expiresAt: new Date(time + 300_000).toISOString(),
      };
      await db.query(
        "INSERT INTO echo.identity_session_challenges(id,user_id,device_id,session_id,statement,expires_at) VALUES($1,$2,$3,$4,$5,$6)",
        [id, actor.account.id, deviceId, actor.id, c, c.expiresAt],
      );
      return c;
    });
  }
  async bindSession(
    actor: AuthorizedSession,
    c: IdentitySessionChallenge,
    signature: string,
  ): Promise<{ deviceId: string; communication: "BLOCKED" }> {
    let text: string;
    try {
      text = sessionBindingText(c);
    } catch {
      fail("INVALID_IDENTITY_STATEMENT");
    }
    if (
      c.origin !== this.origin ||
      c.accountId !== actor.account.id ||
      c.publicId !== actor.account.publicId ||
      c.sessionId !== actor.id
    )
      fail("IDENTITY_SCOPE_MISMATCH");
    return transaction(this.pool, async (db) => {
      const session = await lockUserSession(db, actor.account.id, actor.id, {
        recent: true,
      });
      if (session.deviceId && session.deviceId !== c.deviceId)
        fail("DEVICE_ALREADY_BOUND");
      await this.requireAuthorized(db, actor.account.id, c.deviceId);
      const pub = await db.query<{ public_key: Buffer }>(
        "SELECT public_key FROM echo.identity_device_keys WHERE device_id=$1 AND user_id=$2",
        [c.deviceId, actor.account.id],
      );
      if (!pub.rows[0]) fail("DEVICE_KEY_UNAVAILABLE");
      checkSignature(pub.rows[0].public_key.toString("hex"), signature, text);
      const pending = await db.query<{
        statement: IdentitySessionChallenge;
        consumed_at: Date | null;
      }>(
        "SELECT statement,consumed_at FROM echo.identity_session_challenges WHERE id=$1 AND user_id=$2 AND session_id=$3 FOR UPDATE",
        [c.id, actor.account.id, actor.id],
      );
      if (
        !pending.rows[0] ||
        sessionBindingText(pending.rows[0].statement) !== text
      )
        fail("CHALLENGE_MISMATCH");
      if (pending.rows[0].consumed_at) {
        if (session.deviceId !== c.deviceId) fail("OPERATION_CONFLICT");
        return { deviceId: c.deviceId, communication: "BLOCKED" };
      }
      if (
        !(
          await db.query(
            "SELECT 1 FROM echo.identity_session_challenges WHERE id=$1 AND expires_at>clock_timestamp()",
            [c.id],
          )
        ).rowCount
      )
        fail("CHALLENGE_EXPIRED");
      await db.query("UPDATE echo.sessions SET device_id=$2 WHERE id=$1", [
        actor.id,
        c.deviceId,
      ]);
      await db.query(
        "UPDATE echo.identity_session_challenges SET consumed_at=clock_timestamp() WHERE id=$1",
        [c.id],
      );
      return { deviceId: c.deviceId, communication: "BLOCKED" };
    });
  }
  private async requireAuthorized(
    db: PoolClient,
    userId: string,
    deviceId: string | null,
  ): Promise<void> {
    const r = await db.query(
      "SELECT 1 FROM echo.identity_authorizations a JOIN echo.devices d ON d.id=a.device_id WHERE a.user_id=$1 AND a.device_id=$2 AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND d.status<>'revoked'",
      [userId, deviceId],
    );
    if (!r.rowCount) fail("AUTHORIZED_DEVICE_REQUIRED");
  }
}
