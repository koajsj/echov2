-- Review artifact only. Apply as owner after 007; never at application startup.
BEGIN;
DO $$
BEGIN
  IF current_user <> 'echo_native_owner' THEN
    RAISE EXCEPTION 'Schema owner required';
  END IF;
END;
$$;
LOCK TABLE echo.devices, echo.device_credentials, echo.key_packages IN SHARE ROW EXCLUSIVE MODE;

-- The API may revoke a device but cannot issue/change credentials or manipulate
-- KeyPackages directly. This narrowly scoped trigger runs as the schema owner.
CREATE FUNCTION echo.revoke_device_material() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  UPDATE echo.device_credentials SET revoked_at=clock_timestamp()
    WHERE device_id=NEW.id AND revoked_at IS NULL;
  DELETE FROM echo.key_packages WHERE device_id=NEW.id AND claimed_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION echo.revoke_device_material() FROM PUBLIC, echo_native_api;
CREATE TRIGGER revoke_device_material AFTER UPDATE OF status ON echo.devices
  FOR EACH ROW WHEN (NEW.status='revoked' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION echo.revoke_device_material();

-- Reconcile previously revoked directory entries. Keep claimed package records
-- and all credential bytes for existing operation reconciliation and audit.
UPDATE echo.device_credentials c SET revoked_at=clock_timestamp()
  FROM echo.devices d WHERE c.device_id=d.id AND d.status='revoked' AND c.revoked_at IS NULL;
DELETE FROM echo.key_packages k USING echo.devices d
  WHERE k.device_id=d.id AND d.status='revoked' AND k.claimed_at IS NULL;
COMMIT;
