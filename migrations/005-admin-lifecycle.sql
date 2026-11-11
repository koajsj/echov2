-- Review only; owner applies after 001..004. No crypto authorization or purge grant.
BEGIN;
ALTER TABLE echo.admin_audit_logs DROP CONSTRAINT admin_audit_logs_action_check;
ALTER TABLE echo.admin_audit_logs ADD CONSTRAINT admin_audit_logs_action_check CHECK(action IN
 ('admin-bind','registration-change','invitation-create','user-suspend','user-resume',
 'sessions-revoke','device-revoke','invitation-revoke','security-review'));
ALTER TABLE echo.security_events DROP CONSTRAINT security_events_kind_check;
ALTER TABLE echo.security_events ADD CONSTRAINT security_events_kind_check CHECK(kind IN
 ('login-success','login-failure','device-revoked','reauth-success','reauth-failure','sessions-revoked'));
ALTER TABLE echo.admin_audit_logs ADD COLUMN event_id bigint REFERENCES echo.security_events(id);
ALTER TABLE echo.admin_audit_logs ADD CONSTRAINT audit_event_target CHECK ((action = 'security-review') = (event_id IS NOT NULL));
ALTER TABLE echo.security_events ADD COLUMN reviewed_at timestamptz;
ALTER TABLE echo.security_events ADD COLUMN reviewed_by uuid REFERENCES echo.users(id);
ALTER TABLE echo.security_events ADD CONSTRAINT security_review_pair CHECK ((reviewed_at IS NULL)=(reviewed_by IS NULL));
GRANT UPDATE (reviewed_at,reviewed_by) ON echo.security_events TO echo_native_api;
GRANT UPDATE (revoked_at) ON echo.invitations TO echo_native_api;
CREATE INDEX sessions_device ON echo.sessions(device_id) WHERE device_id IS NOT NULL;
CREATE INDEX security_user_created ON echo.security_events(user_id,created_at);
COMMIT;
