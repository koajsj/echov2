-- Explicit owner-reviewed upgrade after 006; internal UUIDs and foreign keys remain unchanged.
BEGIN;
CREATE FUNCTION echo.new_public_user_id() RETURNS text
LANGUAGE sql VOLATILE SET search_path = pg_catalog AS $$
  SELECT string_agg(substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
    1 + get_byte(uuid_send(gen_random_uuid()), 0) % 32, 1), '' ORDER BY n)
  FROM generate_series(1, 12) AS n
$$;
REVOKE ALL ON FUNCTION echo.new_public_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION echo.new_public_user_id() TO echo_native_api;
ALTER TABLE echo.users ADD COLUMN public_id text COLLATE "C";
ALTER TABLE echo.users ADD CONSTRAINT users_public_id_key UNIQUE (public_id);
-- Backfill without replacing rows or changing UUID identity. The unique index arbitrates collisions.
DO $$
DECLARE account_id uuid; violated_constraint text;
BEGIN
  FOR account_id IN SELECT id FROM echo.users WHERE public_id IS NULL LOOP
    LOOP
      BEGIN
        UPDATE echo.users SET public_id=echo.new_public_user_id() WHERE id=account_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Retry only this assignment; other constraints remain enforced.
        GET STACKED DIAGNOSTICS violated_constraint = CONSTRAINT_NAME;
        IF violated_constraint <> 'users_public_id_key' THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE echo.users ALTER COLUMN public_id SET DEFAULT echo.new_public_user_id();
ALTER TABLE echo.users ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE echo.users ADD CONSTRAINT users_public_id_format CHECK (public_id ~ '^[A-Z2-7]{12}$');
COMMIT;
