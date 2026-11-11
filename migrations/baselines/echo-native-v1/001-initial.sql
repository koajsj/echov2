-- Review artifact only. Provision roles/database separately; never run at startup.
BEGIN;
CREATE SCHEMA echo AUTHORIZATION echo_native_owner;
REVOKE ALL ON SCHEMA echo FROM PUBLIC;

CREATE TABLE echo.users (
  id uuid PRIMARY KEY,
  registration_id uuid UNIQUE,
  registration_hash text,
  username text NOT NULL CHECK (username ~ '^[a-zA-Z0-9_]{3,32}$'),
  username_normalized text GENERATED ALWAYS AS (lower(username COLLATE "C")) STORED UNIQUE,
  password_hash text NOT NULL CHECK (password_hash LIKE '$argon2id$%'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closing','closed')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((registration_id IS NULL) = (registration_hash IS NULL))
);
CREATE TABLE echo.site_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  registration_mode text NOT NULL DEFAULT 'closed' CHECK (registration_mode IN ('open','invite','closed')),
  superadmin_user_id uuid UNIQUE REFERENCES echo.users(id),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0)
);
INSERT INTO echo.site_settings(singleton) VALUES (true);
CREATE TABLE echo.invitations (
  id uuid PRIMARY KEY, token_hash text NOT NULL UNIQUE,
  max_uses integer NOT NULL CHECK (max_uses > 0), uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0 AND uses <= max_uses),
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES echo.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE echo.devices (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES echo.users(id),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz,
  UNIQUE(user_id,id), CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE INDEX devices_user ON echo.devices(user_id,created_at,id);
CREATE FUNCTION echo.guard_device_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'echo_native_api' AND NEW.status <> OLD.status AND NEW.status <> 'revoked' THEN
    RAISE EXCEPTION 'Runtime role cannot authorize or reactivate a device';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_device_transition BEFORE UPDATE ON echo.devices
  FOR EACH ROW EXECUTE FUNCTION echo.guard_device_transition();
CREATE TABLE echo.sessions (
  id uuid PRIMARY KEY, token_hash text NOT NULL UNIQUE, user_id uuid NOT NULL REFERENCES echo.users(id),
  device_id uuid, audience text NOT NULL CHECK (audience IN ('user','admin')),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  reauthenticated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(user_id,device_id) REFERENCES echo.devices(user_id,id), CHECK(expires_at > created_at)
);
CREATE INDEX sessions_expiry ON echo.sessions(expires_at);
CREATE INDEX sessions_user ON echo.sessions(user_id);
CREATE TABLE echo.account_identity_keys (
  user_id uuid NOT NULL REFERENCES echo.users(id), version bigint NOT NULL CHECK(version > 0),
  public_key bytea NOT NULL CHECK(octet_length(public_key) BETWEEN 32 AND 4096),
  authorization_proof bytea NOT NULL CONSTRAINT account_identity_keys_authorization_proof_check CHECK(octet_length(authorization_proof) BETWEEN 1 AND 16384),
  created_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz,
  PRIMARY KEY(user_id,version)
);
CREATE UNIQUE INDEX identity_current ON echo.account_identity_keys(user_id) WHERE retired_at IS NULL;
CREATE TABLE echo.device_credentials (
  id uuid PRIMARY KEY, user_id uuid NOT NULL, device_id uuid NOT NULL,
  root_version bigint NOT NULL, credential bytea NOT NULL CHECK(octet_length(credential) BETWEEN 1 AND 16384),
  signature_public_key bytea NOT NULL CHECK(octet_length(signature_public_key) BETWEEN 32 AND 4096),
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  FOREIGN KEY(user_id,device_id) REFERENCES echo.devices(user_id,id),
  FOREIGN KEY(user_id,root_version) REFERENCES echo.account_identity_keys(user_id,version), UNIQUE(device_id,id)
);
CREATE TABLE echo.key_packages (
  reference bytea PRIMARY KEY, device_id uuid NOT NULL, credential_id uuid NOT NULL,
  public_package bytea NOT NULL CHECK(octet_length(public_package) BETWEEN 1 AND 65536),
  expires_at timestamptz NOT NULL, claimed_operation uuid, claimed_at timestamptz,
  FOREIGN KEY(device_id,credential_id) REFERENCES echo.device_credentials(device_id,id),
  CHECK ((claimed_operation IS NULL) = (claimed_at IS NULL))
);
CREATE INDEX key_packages_available ON echo.key_packages(device_id,expires_at) WHERE claimed_at IS NULL;
CREATE TABLE echo.conversations (
  id uuid PRIMARY KEY, mls_group_id bytea NOT NULL UNIQUE CHECK(octet_length(mls_group_id) BETWEEN 16 AND 255),
  kind text NOT NULL CHECK(kind IN ('direct','group','personal')),
  status text NOT NULL DEFAULT 'frozen' CHECK(status IN ('active','frozen','closed')),
  authorization_version bigint NOT NULL DEFAULT 1 CHECK(authorization_version > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION echo.guard_conversation_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'echo_native_api' AND NEW.status <> OLD.status AND NEW.status <> 'frozen' THEN
    RAISE EXCEPTION 'Runtime role may freeze but not activate or reopen conversations';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_conversation_transition BEFORE UPDATE ON echo.conversations
  FOR EACH ROW EXECUTE FUNCTION echo.guard_conversation_transition();
CREATE TABLE echo.conversation_members (
  conversation_id uuid NOT NULL REFERENCES echo.conversations(id), user_id uuid NOT NULL REFERENCES echo.users(id),
  role text NOT NULL CHECK(role IN ('owner','admin','member')), active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(conversation_id,user_id)
);
CREATE UNIQUE INDEX conversation_owner ON echo.conversation_members(conversation_id) WHERE active AND role = 'owner';
CREATE TABLE echo.group_heads (
  conversation_id uuid PRIMARY KEY REFERENCES echo.conversations(id),
  route_epoch bigint NOT NULL DEFAULT 0 CHECK(route_epoch >= 0),
  last_seq bigint NOT NULL DEFAULT 0 CHECK(last_seq >= 0)
);
CREATE TABLE echo.conversation_devices (
  conversation_id uuid NOT NULL REFERENCES echo.conversations(id), user_id uuid NOT NULL, device_id uuid NOT NULL,
  joined_seq bigint NOT NULL CHECK(joined_seq >= 0), left_seq bigint CHECK(left_seq >= joined_seq),
  PRIMARY KEY(conversation_id,device_id),
  FOREIGN KEY(user_id,device_id) REFERENCES echo.devices(user_id,id),
  FOREIGN KEY(conversation_id,user_id) REFERENCES echo.conversation_members(conversation_id,user_id)
);
CREATE TABLE echo.messages (
  id uuid PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES echo.conversations(id),
  seq bigint NOT NULL CHECK(seq > 0), epoch bigint NOT NULL CHECK(epoch >= 0),
  sender_user_id uuid NOT NULL, sender_device_id uuid NOT NULL,
  operation_id uuid NOT NULL, request_hash text NOT NULL,
  wire_kind text NOT NULL CHECK(wire_kind IN ('application','proposal','commit')),
  ciphertext bytea CHECK(octet_length(ciphertext) BETWEEN 1 AND 262144),
  received_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
  deletion_requested_at timestamptz, deleted_at timestamptz,
  FOREIGN KEY(sender_user_id,sender_device_id) REFERENCES echo.devices(user_id,id),
  UNIQUE(conversation_id,seq), UNIQUE(sender_device_id,operation_id), UNIQUE(conversation_id,id),
  CHECK((deleted_at IS NULL) = (ciphertext IS NOT NULL)),
  CHECK(expires_at IS NULL OR (wire_kind = 'application' AND expires_at > received_at)),
  CHECK(deleted_at IS NULL OR wire_kind = 'application'),
  CHECK(deletion_requested_at IS NULL OR wire_kind = 'application')
);
CREATE UNIQUE INDEX commit_one_candidate ON echo.messages(conversation_id,epoch) WHERE wire_kind = 'commit';
CREATE INDEX messages_expiry ON echo.messages(expires_at,id)
  WHERE expires_at IS NOT NULL AND deleted_at IS NULL AND deletion_requested_at IS NULL;
CREATE FUNCTION echo.guard_message_deletion_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user = 'echo_native_api' AND NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN
    IF OLD.deletion_requested_at IS NOT NULL OR NEW.deletion_requested_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'Runtime role may only set an initial deletion request at transaction time';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_message_deletion_request BEFORE UPDATE ON echo.messages
  FOR EACH ROW EXECUTE FUNCTION echo.guard_message_deletion_request();
CREATE TABLE echo.delivery_cursors (
  device_id uuid NOT NULL REFERENCES echo.devices(id), conversation_id uuid NOT NULL REFERENCES echo.conversations(id),
  acknowledged_seq bigint NOT NULL CHECK(acknowledged_seq >= 0), PRIMARY KEY(device_id,conversation_id)
);
CREATE TABLE echo.device_inbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, device_id uuid NOT NULL REFERENCES echo.devices(id),
  commit_id uuid NOT NULL REFERENCES echo.messages(id), payload bytea NOT NULL CHECK(octet_length(payload) BETWEEN 1 AND 262144),
  acknowledged_at timestamptz, UNIQUE(device_id,commit_id)
);
CREATE TABLE echo.attachments (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES echo.users(id),
  object_name text NOT NULL UNIQUE CHECK(object_name ~ '^[0-9a-f-]{36}$'),
  ciphertext_bytes integer NOT NULL CHECK(ciphertext_bytes BETWEEN 17 AND 10485776),
  status text NOT NULL CHECK(status IN ('staging','active','delete-pending','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  CHECK((status = 'deleted') = (deleted_at IS NOT NULL))
);
CREATE TABLE echo.message_attachments (
  conversation_id uuid NOT NULL, message_id uuid NOT NULL, attachment_id uuid NOT NULL REFERENCES echo.attachments(id),
  PRIMARY KEY(message_id,attachment_id), FOREIGN KEY(conversation_id,message_id) REFERENCES echo.messages(conversation_id,id)
);
CREATE INDEX attachment_references ON echo.message_attachments(attachment_id);
CREATE TABLE echo.deletion_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL UNIQUE, conversation_id uuid NOT NULL, message_id uuid NOT NULL UNIQUE,
  requested_by uuid REFERENCES echo.users(id), reason text NOT NULL CHECK(reason IN ('sender','expiry','account-close')),
  state text NOT NULL DEFAULT 'pending-anchor' CHECK(state IN ('pending-anchor','anchored','purging','complete')),
  anchor_receipt bytea, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  FOREIGN KEY(conversation_id,message_id) REFERENCES echo.messages(conversation_id,id),
  CHECK(state = 'pending-anchor' OR anchor_receipt IS NOT NULL), CHECK((state = 'complete') = (completed_at IS NOT NULL))
);
CREATE INDEX deletion_pending ON echo.deletion_records(id) WHERE state <> 'complete';
CREATE TABLE echo.message_receipts (
  conversation_id uuid NOT NULL, message_id uuid NOT NULL, device_id uuid NOT NULL REFERENCES echo.devices(id),
  delivered_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(message_id,device_id),
  FOREIGN KEY(conversation_id,message_id) REFERENCES echo.messages(conversation_id,id)
);
CREATE TABLE echo.admin_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_user_id uuid NOT NULL REFERENCES echo.users(id),
  action text NOT NULL CHECK(action IN ('admin-bind','registration-change','invitation-create','user-suspend','user-resume')),
  target_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE echo.security_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid REFERENCES echo.users(id),
  kind text NOT NULL CHECK(kind IN ('login-success','login-failure','device-revoked')),
  ip inet, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX security_retention ON echo.security_events(created_at,id);
CREATE TABLE echo.analytics_daily (
  day date PRIMARY KEY, accepted_envelopes bigint CHECK(accepted_envelopes >= 0),
  registered_users bigint CHECK(registered_users >= 0), traffic_bytes bigint CHECK(traffic_bytes >= 0),
  source text NOT NULL, observed_at timestamptz NOT NULL
);
CREATE TABLE echo.backup_records (
  id uuid PRIMARY KEY, state text NOT NULL CHECK(state IN ('capturing','captured','verified','failed')),
  manifest_hash text, deletion_anchor bytea, external_location text,
  created_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz,
  CHECK(state <> 'verified' OR (manifest_hash IS NOT NULL AND deletion_anchor IS NOT NULL AND verified_at IS NOT NULL))
);
COMMIT;
