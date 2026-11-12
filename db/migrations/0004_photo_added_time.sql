-- Legacy uploads have no recorded insertion timestamp; do not invent one.
ALTER TABLE diary.photos ADD COLUMN created_at timestamptz;
ALTER TABLE diary.photos ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE INDEX photos_recent ON diary.photos(vault_id, session_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
