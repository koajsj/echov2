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
): Promise<void> {
  const user = await db.query(
    "SELECT id FROM echo.users WHERE id=$1 AND status='active' FOR UPDATE",
    [userId],
  );
  if (!user.rowCount)
    throw new HttpError(401, "ACCOUNT_UNAVAILABLE", "账号不可用。");
  const session = await db.query<{
    device_id: string | null;
  }>(
    `SELECT device_id FROM echo.sessions
    WHERE id=$1 AND user_id=$2 AND audience=$4 AND expires_at>clock_timestamp()
    AND (NOT $3::boolean OR reauthenticated_at>clock_timestamp()-interval '5 minutes')
    AND ($4<>'admin' OR EXISTS(SELECT 1 FROM echo.site_settings x WHERE x.singleton AND x.superadmin_user_id=$2)) FOR UPDATE`,
    [sessionId, userId, options.recent ?? false, options.audience ?? "user"],
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
      `SELECT d.id FROM echo.devices d WHERE d.id=$1 AND d.user_id=$2 AND d.status='active'
      AND EXISTS(SELECT 1 FROM echo.device_credentials c JOIN echo.account_identity_keys k
        ON k.user_id=c.user_id AND k.version=c.root_version
        WHERE c.device_id=d.id AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp() AND k.retired_at IS NULL)
      FOR UPDATE OF d`,
      [options.deviceId, userId],
    );
    if (!device.rowCount)
      throw new HttpError(
        403,
        "TRUSTED_DEVICE_REQUIRED",
        "设备授权不可用。目录记录本身不证明密码学可信。",
      );
  }
}
