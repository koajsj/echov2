-- Incremental review artifact. Never executed by application startup.
-- 001/002 are immutable. Apply only after owner review in a future authorized run.
BEGIN;
LOCK TABLE echo.group_heads, echo.messages, echo.device_inbox IN ACCESS EXCLUSIVE MODE;
-- Legacy counters advanced on unverified declarations. Never silently reinterpret history.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM echo.messages)
    OR EXISTS(SELECT 1 FROM echo.group_heads WHERE route_epoch<>0 OR last_seq<>0)
    OR EXISTS(SELECT 1 FROM echo.device_inbox) THEN
    RAISE EXCEPTION 'Legacy delivery history requires an independently reviewed migration; no data changed';
  END IF;
END;
$$;
ALTER TABLE echo.group_heads RENAME COLUMN route_epoch TO route_version;
ALTER TABLE echo.messages RENAME COLUMN epoch TO route_version;
ALTER INDEX echo.commit_one_candidate RENAME TO commit_one_route_candidate;
ALTER TABLE echo.group_heads ADD COLUMN pending_commit_id uuid;
ALTER TABLE echo.group_heads ADD CONSTRAINT pending_commit_conversation
  FOREIGN KEY(conversation_id,pending_commit_id) REFERENCES echo.messages(conversation_id,id);
-- Renaming preserves existing column privileges; this grant covers only the new pointer.
GRANT UPDATE (pending_commit_id) ON echo.group_heads TO echo_native_api;
CREATE INDEX conversation_devices_current ON echo.conversation_devices(device_id,conversation_id)
  WHERE left_seq IS NULL;
CREATE INDEX conversation_members_user ON echo.conversation_members(user_id,conversation_id)
  WHERE active;
CREATE INDEX users_created ON echo.users(created_at,id);
COMMIT;
