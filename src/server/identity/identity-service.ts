import type { Pool } from "pg";

export class IdentityService {
  constructor(private readonly pool: Pool) {}
  async ownIdentity(userId: string) {
    const result = await this.pool.query<{ version: string; public_key: Buffer; created_at: Date }>("SELECT version::text,public_key,created_at FROM echo.account_identity_keys WHERE user_id=$1 AND retired_at IS NULL", [userId]);
    const row = result.rows[0];
    return row ? { version: row.version, publicKey: row.public_key.toString("base64"), registeredAt: row.created_at.toISOString(), trust: "directory-record-only" as const } : null;
  }
}
