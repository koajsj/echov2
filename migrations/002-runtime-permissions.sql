-- Apply only as the independently provisioned schema owner, after review.
BEGIN;
REVOKE ALL ON ALL TABLES IN SCHEMA echo FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA echo FROM PUBLIC;
GRANT USAGE ON SCHEMA echo TO echo_native_api;
GRANT SELECT ON ALL TABLES IN SCHEMA echo TO echo_native_api;
GRANT INSERT ON echo.users, echo.sessions, echo.invitations, echo.delivery_cursors TO echo_native_api;
GRANT INSERT (id,conversation_id,seq,epoch,sender_user_id,sender_device_id,operation_id,request_hash,wire_kind,ciphertext,expires_at)
  ON echo.messages TO echo_native_api;
-- This lifecycle column also permits SELECT FOR UPDATE without granting ciphertext/purge writes.
GRANT UPDATE (deletion_requested_at) ON echo.messages TO echo_native_api;
GRANT UPDATE (username,status,version) ON echo.users TO echo_native_api;
GRANT UPDATE (device_id,reauthenticated_at) ON echo.sessions TO echo_native_api;
GRANT UPDATE (uses) ON echo.invitations TO echo_native_api;
GRANT UPDATE (route_epoch,last_seq) ON echo.group_heads TO echo_native_api;
GRANT UPDATE (acknowledged_seq) ON echo.delivery_cursors TO echo_native_api;
GRANT UPDATE (status) ON echo.conversations TO echo_native_api;
GRANT INSERT (operation_id,conversation_id,message_id,requested_by,reason) ON echo.deletion_records TO echo_native_api;
GRANT INSERT (id,user_id,label), UPDATE (status,revoked_at,version) ON echo.devices TO echo_native_api;
GRANT DELETE ON echo.sessions TO echo_native_api;
GRANT INSERT ON echo.admin_audit_logs, echo.security_events TO echo_native_api;
GRANT UPDATE (registration_mode, version) ON echo.site_settings TO echo_native_api;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA echo TO echo_native_api;
-- No runtime grants to authorize devices, issue credentials, create groups or import keys.
REVOKE ALL ON FUNCTION echo.guard_device_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION echo.guard_conversation_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION echo.guard_message_deletion_request() FROM PUBLIC;
COMMIT;
