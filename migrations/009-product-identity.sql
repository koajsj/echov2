-- Public, signed identity records only. Does not grant MLS admission or change 001-008.
BEGIN;
DO $$ BEGIN
  IF current_user <> 'echo_native_owner' THEN RAISE EXCEPTION 'Schema owner required'; END IF;
END; $$;
ALTER TABLE echo.security_events DROP CONSTRAINT security_events_kind_check;
ALTER TABLE echo.security_events ADD CONSTRAINT security_events_kind_check CHECK(kind IN
 ('login-success','login-failure','device-revoked','reauth-success','reauth-failure','sessions-revoked','identity-root-initialized','identity-device-authorized'));
CREATE TABLE echo.identity_roots (
  user_id uuid PRIMARY KEY REFERENCES echo.users(id),
  version integer NOT NULL CHECK(version=1),
  public_key bytea NOT NULL CHECK(octet_length(public_key)=32),
  statement jsonb NOT NULL CHECK(jsonb_typeof(statement)='object'),
  signature bytea NOT NULL CHECK(octet_length(signature)=64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE echo.identity_device_keys (
  user_id uuid NOT NULL,
  device_id uuid PRIMARY KEY,
  public_key bytea NOT NULL CHECK(octet_length(public_key)=32),
  FOREIGN KEY(user_id,device_id) REFERENCES echo.devices(user_id,id),
  UNIQUE(user_id,device_id)
);
CREATE TABLE echo.identity_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  statement jsonb NOT NULL CHECK(jsonb_typeof(statement)='object'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY(user_id,device_id) REFERENCES echo.identity_device_keys(user_id,device_id),
  UNIQUE(user_id,device_id,id)
);
CREATE INDEX identity_challenges_pending ON echo.identity_challenges(device_id,expires_at) WHERE consumed_at IS NULL;
CREATE TABLE echo.identity_authorizations (
  device_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES echo.identity_roots(user_id),
  challenge_id uuid NOT NULL UNIQUE,
  credential jsonb NOT NULL CHECK(jsonb_typeof(credential)='object'),
  device_signature bytea NOT NULL CHECK(octet_length(device_signature)=64),
  root_signature bytea NOT NULL CHECK(octet_length(root_signature)=64),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY(user_id,device_id,challenge_id) REFERENCES echo.identity_challenges(user_id,device_id,id)
);
CREATE TABLE echo.identity_session_challenges (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES echo.sessions(id) ON DELETE CASCADE,
  statement jsonb NOT NULL CHECK(jsonb_typeof(statement)='object'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  FOREIGN KEY(user_id,device_id) REFERENCES echo.identity_device_keys(user_id,device_id)
);
CREATE INDEX identity_session_challenges_pending ON echo.identity_session_challenges(session_id,expires_at) WHERE consumed_at IS NULL;
-- Existing device revoke also revokes these public authorizations; no reactivation path.
CREATE FUNCTION echo.revoke_identity_authorization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE echo.identity_authorizations SET revoked_at=clock_timestamp()
    WHERE device_id=NEW.id AND revoked_at IS NULL;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION echo.revoke_identity_authorization() FROM PUBLIC, echo_native_api;
CREATE TRIGGER revoke_identity_authorization AFTER UPDATE OF status ON echo.devices
  FOR EACH ROW WHEN(NEW.status='revoked' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION echo.revoke_identity_authorization();
REVOKE ALL ON echo.identity_roots, echo.identity_device_keys, echo.identity_challenges, echo.identity_authorizations, echo.identity_session_challenges FROM PUBLIC, echo_native_api;
GRANT SELECT,INSERT ON echo.identity_roots, echo.identity_device_keys, echo.identity_challenges, echo.identity_authorizations, echo.identity_session_challenges TO echo_native_api;
GRANT UPDATE(consumed_at) ON echo.identity_challenges, echo.identity_session_challenges TO echo_native_api;
-- No UPDATE/DELETE root/key/signature rights; server stores no private keys. Application verifies signatures.
COMMIT;
