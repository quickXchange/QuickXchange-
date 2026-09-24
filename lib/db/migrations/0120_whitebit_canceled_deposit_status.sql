ALTER TABLE whitebit_deposits
  DROP CONSTRAINT IF EXISTS whitebit_status_valid;
ALTER TABLE whitebit_deposits
  ADD CONSTRAINT whitebit_status_valid
  CHECK (status IN ('accepted', 'updated', 'processed', 'canceled', 'unknown'));