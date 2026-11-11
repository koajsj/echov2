-- Incremental review artifact only; no SQL has been executed.
BEGIN;
ALTER TABLE echo.invitations ADD COLUMN operation_id uuid UNIQUE;
ALTER TABLE echo.invitations ADD COLUMN request_hash text;
ALTER TABLE echo.invitations ADD CONSTRAINT invitation_operation_pair
  CHECK ((operation_id IS NULL)=(request_hash IS NULL));
COMMIT;
