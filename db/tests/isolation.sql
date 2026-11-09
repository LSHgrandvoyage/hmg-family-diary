\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('test.vault', (SELECT id::text FROM diary.vaults LIMIT 1),true);
SET LOCAL ROLE diary_app;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'Privileged runtime role'; END IF;
 IF EXISTS(SELECT 1 FROM diary.memories) THEN RAISE EXCEPTION 'RLS leaks without context'; END IF;
 BEGIN PERFORM 1 FROM auth."user"; RAISE EXCEPTION 'App role can read auth'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='diary' AND c.relkind='r' AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) THEN RAISE EXCEPTION 'Runtime owns tables'; END IF;
END$$;
SELECT set_config('diary.vault_id',current_setting('test.vault'),true);
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM diary.memories WHERE vault_id<>current_setting('test.vault')::uuid) THEN RAISE EXCEPTION 'RLS cross-vault leak'; END IF;
 BEGIN INSERT INTO diary.memories(id,vault_id,snapshot,revision) VALUES(gen_random_uuid(),gen_random_uuid(),'{}',1); RAISE EXCEPTION 'RLS write accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END$$;
ROLLBACK;
