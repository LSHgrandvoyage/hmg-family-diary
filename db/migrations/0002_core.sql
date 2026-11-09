SET LOCAL search_path TO diary, pg_catalog;
CREATE TABLE vaults (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL UNIQUE REFERENCES auth."user"(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE devices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vault_id uuid NOT NULL REFERENCES vaults(id), label text NOT NULL CHECK(length(label) BETWEEN 1 AND 40), token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX one_vehicle ON devices(vault_id) WHERE revoked_at IS NULL;
CREATE TABLE pairings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vault_id uuid NOT NULL REFERENCES vaults(id), code_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE memories (id uuid NOT NULL, vault_id uuid NOT NULL REFERENCES vaults(id), snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'), revision integer NOT NULL CHECK(revision>0), audio_ready boolean NOT NULL DEFAULT false, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(vault_id,id));
CREATE TABLE photos (id uuid NOT NULL, vault_id uuid NOT NULL, session_id uuid NOT NULL, bytes integer NOT NULL CHECK(bytes>0), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), deleted_at timestamptz, PRIMARY KEY(vault_id,id), FOREIGN KEY(vault_id,session_id) REFERENCES memories(vault_id,id));
CREATE TABLE changes (seq bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, vault_id uuid NOT NULL REFERENCES vaults(id), session_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(vault_id,session_id) REFERENCES memories(vault_id,id));
CREATE INDEX changes_cursor ON changes(vault_id,seq);
CREATE TABLE requests (vault_id uuid NOT NULL REFERENCES vaults(id), key uuid NOT NULL, digest text NOT NULL, response jsonb NOT NULL, PRIMARY KEY(vault_id,key));
CREATE TABLE purge_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vault_id uuid NOT NULL, session_id uuid NOT NULL, photo_id uuid, done_at timestamptz, available_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0, FOREIGN KEY(vault_id,session_id) REFERENCES memories(vault_id,id));
CREATE TABLE limits (key text PRIMARY KEY, bucket bigint NOT NULL, attempts integer NOT NULL);
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['vaults','devices','pairings','memories','photos','changes','requests','purge_jobs'] LOOP
  EXECUTE format('ALTER TABLE diary.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY vault_scope ON diary.%I USING (%I = nullif(current_setting(''diary.vault_id'',true),'''')::uuid) WITH CHECK (%I = nullif(current_setting(''diary.vault_id'',true),'''')::uuid)',t,CASE WHEN t='vaults' THEN 'id' ELSE 'vault_id' END,CASE WHEN t='vaults' THEN 'id' ELSE 'vault_id' END);
 END LOOP;
END$$;
GRANT SELECT,INSERT,UPDATE,DELETE ON vaults,devices,pairings,memories,photos,changes,requests,purge_jobs TO diary_app;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA diary TO diary_app;
CREATE FUNCTION ensure_vault(owner uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = diary,pg_catalog AS $$DECLARE v uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth."user" WHERE id=owner AND "emailVerified"=true) THEN RAISE EXCEPTION 'Unverified owner'; END IF;
 INSERT INTO vaults(owner_id) VALUES(owner) ON CONFLICT(owner_id) DO NOTHING;
 SELECT id INTO v FROM vaults WHERE owner_id=owner; RETURN v;
END$$;
CREATE FUNCTION device_identity(hash text) RETURNS TABLE(id uuid,vault_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path = diary,pg_catalog AS $$ SELECT id,vault_id FROM devices WHERE token_hash=hash AND revoked_at IS NULL AND expires_at>now() $$;
CREATE FUNCTION claim_pairing(hash text, token text, name text) RETURNS TABLE(id uuid,vault_id uuid,expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = diary,pg_catalog AS $$DECLARE p pairings; BEGIN
 SELECT * INTO p FROM pairings WHERE code_hash=hash FOR UPDATE;
 IF p.id IS NULL OR p.consumed_at IS NOT NULL OR p.expires_at<=now() THEN RETURN; END IF;
 PERFORM 1 FROM vaults WHERE vaults.id=p.vault_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM devices WHERE devices.vault_id=p.vault_id AND revoked_at IS NULL AND devices.expires_at>now()) THEN RETURN; END IF;
 UPDATE devices SET revoked_at=now() WHERE devices.vault_id=p.vault_id AND revoked_at IS NULL;
 UPDATE pairings SET consumed_at=now() WHERE pairings.id=p.id;
 RETURN QUERY INSERT INTO devices(vault_id,label,token_hash,expires_at) VALUES(p.vault_id,name,token,now()+interval '30 days') RETURNING devices.id,devices.vault_id,devices.expires_at;
END$$;
CREATE FUNCTION allow_attempt(k text, maximum integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=diary,pg_catalog AS $$DECLARE b bigint:=floor(extract(epoch FROM now())/600); n integer; BEGIN
 INSERT INTO limits(key,bucket,attempts) VALUES(k,b,1) ON CONFLICT(key) DO UPDATE SET bucket=b, attempts=CASE WHEN limits.bucket=b THEN limits.attempts+1 ELSE 1 END RETURNING attempts INTO n;
 RETURN n<=maximum;
END$$;
CREATE FUNCTION claim_purge() RETURNS SETOF purge_jobs LANGUAGE sql SECURITY DEFINER SET search_path=diary,pg_catalog AS $$ UPDATE purge_jobs SET attempts=attempts+1,available_at=now()+interval '1 minute' WHERE id=(SELECT id FROM purge_jobs WHERE done_at IS NULL AND available_at<=now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING * $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA diary FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ensure_vault(uuid),device_identity(text),claim_pairing(text,text,text),allow_attempt(text,integer),claim_purge() TO diary_app;
