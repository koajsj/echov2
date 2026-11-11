-- Owner-only forward upgrade. Never adopts an unrecorded existing schema.
BEGIN;
LOCK TABLE echo.account_identity_keys IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE
  old_col record;
  new_col record;
  target smallint;
  check_name text;
  expression text;
BEGIN
  IF current_user <> 'echo_native_owner' THEN
    RAISE EXCEPTION 'Schema owner required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM echo_meta.schema_migrations
    WHERE version='001' AND status='applied') THEN
    RAISE EXCEPTION 'Explicit baseline record required; automatic adoption forbidden';
  END IF;
  SELECT * INTO old_col FROM pg_attribute
    WHERE attrelid='echo.account_identity_keys'::regclass AND attname='authorization' AND NOT attisdropped;
  SELECT * INTO new_col FROM pg_attribute
    WHERE attrelid='echo.account_identity_keys'::regclass AND attname='authorization_proof' AND NOT attisdropped;
  IF old_col.attnum IS NOT NULL AND new_col.attnum IS NOT NULL THEN
    RAISE EXCEPTION 'Both proof columns exist';
  END IF;
  IF old_col.attnum IS NULL AND new_col.attnum IS NULL THEN
    RAISE EXCEPTION 'Proof column missing';
  END IF;
  IF old_col.attnum IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM echo_meta.schema_migrations WHERE version='001'
      AND migration_name='echo-native-v1' AND status='applied') AND NOT EXISTS
      (SELECT 1 FROM echo_meta.schema_migrations WHERE version='006' AND status='applied') THEN
      RAISE EXCEPTION 'New column without a canonical baseline record requires manual review';
    END IF;
    target := new_col.attnum;
  ELSE
    target := old_col.attnum;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='echo.account_identity_keys'::regclass
    AND attnum=target AND (atttypid<>'bytea'::regtype OR NOT attnotnull OR atthasdef
      OR attacl IS NOT NULL OR attgenerated<>'' OR attidentity<>'')) THEN
    RAISE EXCEPTION 'Unexpected proof column type, nullability, default or column ACL';
  END IF;
  -- Only the known single-column byte-length CHECK is supported. Unknown dependencies stop.
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='echo.account_identity_keys'::regclass
    AND target=ANY(conkey)) <> 1 THEN
    RAISE EXCEPTION 'Unexpected constraint dependencies';
  END IF;
  SELECT conname, pg_get_expr(conbin,conrelid) INTO check_name, expression FROM pg_constraint
    WHERE conrelid='echo.account_identity_keys'::regclass AND contype='c'
      AND conkey=ARRAY[target] AND convalidated AND NOT connoinherit;
  IF check_name IS NULL OR regexp_replace(expression,'["()[:space:]]','','g') NOT IN
    ('octet_lengthauthorization>=1ANDoctet_lengthauthorization<=16384',
     'octet_lengthauthorization_proof>=1ANDoctet_lengthauthorization_proof<=16384') THEN
    RAISE EXCEPTION 'Unexpected length CHECK';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_depend d
    WHERE d.refclassid='pg_class'::regclass AND d.refobjid='echo.account_identity_keys'::regclass
      AND d.refobjsubid=target AND NOT (d.classid='pg_constraint'::regclass
        AND d.objid IN (SELECT oid FROM pg_constraint WHERE conrelid='echo.account_identity_keys'::regclass AND conname=check_name))) THEN
    RAISE EXCEPTION 'Unreviewed column index/view/dependency';
  END IF;
  -- SQL functions may store bodies as text instead of catalog dependencies. Reject unknown functions.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
      AND (p.prosrc ILIKE '%account_identity_keys%' OR p.prosrc ~ '\mauthorization\M')) THEN
    RAISE EXCEPTION 'Unreviewed function reference';
  END IF;
  IF old_col.attnum IS NOT NULL THEN
    ALTER TABLE echo.account_identity_keys RENAME COLUMN "authorization" TO authorization_proof;
  END IF;
  IF check_name <> 'account_identity_keys_authorization_proof_check' THEN
    EXECUTE format('ALTER TABLE echo.account_identity_keys RENAME CONSTRAINT %I TO account_identity_keys_authorization_proof_check',check_name);
  END IF;
END;
$$;
COMMIT;
