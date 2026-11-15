import type { Audience } from "../../shared/contracts.js";
import type { PoolClient } from "pg";
import { HttpError } from "../api/http-error.js";

// Lock order: account -> session -> device -> conversation -> group head.
// This guards an individual HTTP operation, not MLS trust or historical authorization.
export async function lockUserSession(
  db: PoolClient,
  userId: string,
  sessionId: string,
  options: {
    recent?: boolean;
    deviceId?: string;
    audience?: Audience;
  } = {},
): Promise<{ deviceId: string | null; expiresAt: Date }> {
  const user = await db.query(
    "SELECT id FROM echo.users WHERE id=$1 AND status='active' FOR UPDATE",
    [userId],
  );
  if (!user.rowCount)
    throw new HttpError(401, "ACCOUNT_UNAVAILABLE", "账号不可用。");
  const session = await db.query<{
    device_id: string | null;
  }>(
    "SELECT device_id FROM echo.sessions WHERE id=$1 AND user_id=$2 AND audience=$3 FOR UPDATE",
    [sessionId, userId, options.audience ?? "user"],
  );
  if (!session.rows[0])
    throw new HttpError(401, "SESSION_EXPIRED", "会话已失效，请重新认证。");
  if (options.deviceId !== undefined) {
    if (session.rows[0].device_id !== options.deviceId)
      throw new HttpError(
        403,
        "DEVICE_SESSION_MISMATCH",
        "设备不属于当前会话。",
      );
    const device = await db.query(
      "SELECT id FROM echo.devices WHERE id=$1 AND user_id=$2 AND status='active' FOR UPDATE",
      [options.deviceId, userId],
    );
    if (!device.rowCount)
      throw new HttpError(
        403,
        "TRUSTED_DEVICE_REQUIRED",
        "设备授权不可用。目录记录本身不证明密码学可信。",
      );
  }
  // Evaluate deadlines after all row-lock waits. A volatile WHERE predicate on
  // SELECT FOR UPDATE can have been evaluated before an unchanged row's lock wait.
  const valid = await db.query<{
    session_valid: boolean;
    device_valid: boolean;
    expires_at: Date;
  }>(
    `SELECT s.expires_at>clock_timestamp()
      AND (NOT $3::boolean OR s.reauthenticated_at>clock_timestamp()-interval '5 minutes')
      AND ($4<>'admin' OR EXISTS(SELECT 1 FROM echo.site_settings x WHERE x.singleton AND x.superadmin_user_id=$2)) AS session_valid,
      ($5::uuid IS NULL OR EXISTS(SELECT 1 FROM echo.device_credentials c
        JOIN echo.account_identity_keys k ON k.user_id=c.user_id AND k.version=c.root_version
        WHERE c.device_id=$5 AND c.user_id=$2 AND c.revoked_at IS NULL
        AND c.expires_at>clock_timestamp() AND k.retired_at IS NULL)) AS device_valid,
      s.expires_at
      FROM echo.sessions s WHERE s.id=$1`,
    [
      sessionId,
      userId,
      options.recent ?? false,
      options.audience ?? "user",
      options.deviceId ?? null,
    ],
  );
  if (!valid.rows[0]?.session_valid)
    throw new HttpError(401, "SESSION_EXPIRED", "会话已失效，请重新认证。");
  if (!valid.rows[0].device_valid)
    throw new HttpError(
      403,
      "TRUSTED_DEVICE_REQUIRED",
      "设备授权已过期或撤销。",
    );
  return {
    deviceId: session.rows[0].device_id,
    expiresAt: valid.rows[0].expires_at,
  };
}
