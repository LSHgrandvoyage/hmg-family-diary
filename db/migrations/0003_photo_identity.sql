SET LOCAL search_path TO diary,pg_catalog;
ALTER TABLE photos ADD COLUMN input_sha256 text CHECK(input_sha256 ~ '^[a-f0-9]{64}$');
-- Older synthetic photos remain readable; an unknown upload hash cannot authorize a replay.
