import { isDeepStrictEqual } from "node:util";
import { Pool, type PoolClient } from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  HttpError,
  uuid,
  revision,
  json,
  errorResponse,
  parseRange,
} from "../../../../packages/contracts/src/http.ts";
import { snapshot } from "../../../../packages/sync/src/snapshot.ts";
import {
  LocalAudioStore,
  inspectWav,
} from "../../../../packages/storage/src/local-audio-store.ts";
import { changeEvents } from "./change-events.ts";
import { authentication } from "./auth.ts";
export const digest = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
export const domainPool = () =>
  new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
let pool: Pool;
const db = () => (pool ??= domainPool());
const audio = () =>
  new LocalAudioStore(process.env.AUDIO_ROOT!, 42 * 1024 * 1024);
const photoPath = (vault: string, id: string) =>
  join(process.env.PHOTO_ROOT!, uuid(vault), `${uuid(id)}.jpg`);
type Principal = { vault: string; device?: string };
async function identify(req: Request): Promise<Principal> {
  const token = req.headers.get("authorization");
  if (token) {
    if (!/^Bearer [a-f0-9]{64}$/.test(token))
      throw new HttpError(401, "DEVICE_REVOKED");
    const r = await db().query("SELECT * FROM diary.device_identity($1)", [
      digest(token.slice(7)),
    ]);
    if (!r.rowCount) throw new HttpError(401, "DEVICE_REVOKED");
    return { vault: r.rows[0].vault_id, device: r.rows[0].id };
  }
  const s = await authentication().api.getSession({ headers: req.headers });
  if (!s?.user.emailVerified) throw new HttpError(401, "LOGIN_REQUIRED");
  const r = await db().query("SELECT diary.ensure_vault($1) AS id", [
    s.user.id,
  ]);
  return { vault: r.rows[0].id };
}
async function bytes(req: Request, max: number) {
  if (Number(req.headers.get("content-length") || 0) > max)
    throw new HttpError(413, "TOO_LARGE");
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError(422, "EMPTY_BODY");
  const parts: Uint8Array[] = [];
  let n = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      n += r.value.length;
      if (n > max) throw new HttpError(413, "TOO_LARGE");
      parts.push(r.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(parts, n);
}
async function body(req: Request) {
  try {
    return JSON.parse((await bytes(req, 240000)).toString());
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(422, "INVALID_JSON");
  }
}
async function memory(
  c: PoolClient,
  p: Principal,
  id: string,
  allowDeleted = false,
) {
  const r = await c.query(
    "SELECT * FROM diary.memories WHERE vault_id=$1 AND id=$2",
    [p.vault, id],
  );
  if (!r.rowCount) throw new HttpError(404, "NOT_FOUND");
  const m = r.rows[0];
  if (m.deleted_at) {
    if (!allowDeleted) throw new HttpError(410, "DELETED");
    return { id, deleted: true, revision: m.revision };
  }
  const photos = await c.query(
    "SELECT id,sha256,bytes,created_at FROM diary.photos WHERE vault_id=$1 AND session_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC NULLS LAST,id DESC",
    [p.vault, id],
  );
  return {
    id,
    deleted: false,
    revision: m.revision,
    audio_ready: m.audio_ready,
    snapshot: m.snapshot,
    photos: photos.rows,
  };
}
async function changed(c: PoolClient, p: Principal, id: string) {
  await c.query(
    "INSERT INTO diary.changes(vault_id,session_id) VALUES($1,$2)",
    [p.vault, id],
  );
  await c.query("SELECT pg_notify('diary_changed',$1)", [p.vault]);
}
async function tx(p: Principal, fn: (c: PoolClient) => Promise<Response>) {
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('diary.vault_id',$1,true)", [p.vault]);
    // Serializes all vault mutations and change sequence assignment before commit.
    await c.query("SELECT id FROM diary.vaults WHERE id=$1 FOR UPDATE", [
      p.vault,
    ]);
    if (p.device) {
      const active = await c.query(
        "SELECT id FROM diary.devices WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()",
        [p.device],
      );
      if (!active.rowCount) throw new HttpError(401, "DEVICE_REVOKED");
    }
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
function owner(p: Principal) {
  if (p.device) throw new HttpError(403, "OWNER_REQUIRED");
}
export async function handleDomain(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url),
      path = url.pathname.replace(/^\/api\/v1\//, "").split("/"),
      method = req.method;
    if (
      !["GET", "HEAD"].includes(method) &&
      req.headers.get("origin") !== process.env.APP_ORIGIN &&
      !req.headers.get("authorization")
    )
      throw new HttpError(403, "INVALID_ORIGIN");
    if (path.join("/") === "devices/claim" && method === "POST") {
      // Proxy overwrites X-Forwarded-For; web is never exposed directly in Compose.
      const ip =
        req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
        "unknown";
      const allowed = await db().query(
        "SELECT diary.allow_attempt($1,20) AS ok",
        [digest(`pair:${ip}`)],
      );
      if (!allowed.rows[0].ok) throw new HttpError(429, "RATE_LIMITED");
      const b = await body(req);
      if (
        typeof b.code !== "string" ||
        !/^\d{8}$/.test(b.code) ||
        typeof b.label !== "string" ||
        !b.label.trim() ||
        b.label.length > 40
      )
        throw new HttpError(422, "INVALID_PAIRING");
      const token = randomBytes(32).toString("hex");
      const r = await db().query(
        "SELECT * FROM diary.claim_pairing($1,$2,$3)",
        [digest(b.code), digest(token), b.label.trim()],
      );
      if (!r.rowCount) throw new HttpError(409, "PAIRING_UNAVAILABLE");
      return json({ ...r.rows[0], token }, 201);
    }
    const p = await identify(req);
    if (path.length === 1 && path[0] === "events" && method === "GET")
      return await changeEvents(req, p.vault, async () => {
        const current = await identify(req);
        if (current.vault !== p.vault)
          throw new HttpError(401, "LOGIN_REQUIRED");
      });
    return await tx(p, async (c) => {
      if (path[0] === "me" && method === "GET")
        return json({
          vault_id: p.vault,
          device_id: p.device ?? null,
          device_label: p.device
            ? ((
                await c.query(
                  "SELECT label FROM diary.devices WHERE id=$1 AND vault_id=$2",
                  [p.device, p.vault],
                )
              ).rows[0]?.label ?? null)
            : null,
          generation_mode: "mock",
          speech_timeline_version: 1,
        });
      if (path[0] === "pairings" && method === "POST") {
        owner(p);
        const active = await c.query(
          "SELECT id FROM diary.devices WHERE vault_id=$1 AND revoked_at IS NULL AND expires_at>now()",
          [p.vault],
        );
        if (active.rowCount)
          throw new HttpError(409, "VEHICLE_ALREADY_CONNECTED");
        const limit = await c.query("SELECT diary.allow_attempt($1,10) AS ok", [
          `codes:${p.vault}`,
        ]);
        if (!limit.rows[0].ok) throw new HttpError(429, "RATE_LIMITED");
        const code = String(randomBytes(4).readUInt32BE() % 100000000).padStart(
          8,
          "0",
        );
        await c.query(
          "UPDATE diary.pairings SET consumed_at=now() WHERE vault_id=$1 AND consumed_at IS NULL",
          [p.vault],
        );
        const r = await c.query(
          "INSERT INTO diary.pairings(vault_id,code_hash,expires_at) VALUES($1,$2,now()+interval '5 minutes') RETURNING expires_at",
          [p.vault, digest(code)],
        );
        return json({ code, expires_at: r.rows[0].expires_at }, 201);
      }
      if (path[0] === "devices") {
        if (path.length === 2 && method === "PATCH") {
          const id = uuid(path[1]);
          if (p.device && p.device !== id)
            throw new HttpError(403, "FORBIDDEN");
          const b = await body(req);
          if (
            typeof b.label !== "string" ||
            !b.label.trim() ||
            b.label.trim().length > 40
          )
            throw new HttpError(422, "INVALID_DEVICE_LABEL");
          const r = await c.query(
            "UPDATE diary.devices SET label=$3 WHERE vault_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING id,label",
            [p.vault, id, b.label.trim()],
          );
          if (!r.rowCount) throw new HttpError(404, "NOT_FOUND");
          await c.query("SELECT pg_notify('diary_changed',$1)", [p.vault]);
          return json(r.rows[0]);
        }
        owner(p);
        if (path.length === 1 && method === "GET")
          return json({
            devices: (
              await c.query(
                "SELECT id,label,expires_at,revoked_at FROM diary.devices WHERE vault_id=$1 ORDER BY created_at DESC",
                [p.vault],
              )
            ).rows,
          });
        if (path.length === 2 && method === "DELETE") {
          await c.query(
            "UPDATE diary.devices SET revoked_at=coalesce(revoked_at,now()) WHERE vault_id=$1 AND id=$2",
            [p.vault, uuid(path[1])],
          );
          return json({ revoked: true });
        }
      }
      if (path[0] === "sync" && method === "GET") {
        const cursor = url.searchParams.get("cursor") || "0";
        if (!/^\d{1,16}$/.test(cursor))
          throw new HttpError(422, "INVALID_CURSOR");
        const r = await c.query(
          "SELECT seq::text,session_id FROM diary.changes WHERE vault_id=$1 AND seq>$2 ORDER BY seq LIMIT 100",
          [p.vault, cursor],
        );
        const items = [];
        for (const id of new Set<string>(r.rows.map((x) => x.session_id)))
          items.push(await memory(c, p, id, true));
        return json({
          items,
          cursor: r.rows.at(-1)?.seq ?? cursor,
          has_more: r.rowCount === 100,
        });
      }
      if (path[0] !== "sessions") throw new HttpError(404, "NOT_FOUND");
      if (path.length === 1 && method === "GET") {
        const r = await c.query(
          "SELECT id FROM diary.memories WHERE vault_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 200",
          [p.vault],
        );
        const items = [];
        for (const row of r.rows) items.push(await memory(c, p, row.id));
        return json({ items });
      }
      const id = uuid(path[1]);
      if (path[2] === "snapshot" && path.length === 3 && method === "PUT") {
        if (!p.device) throw new HttpError(403, "VEHICLE_REQUIRED");
        const b = await body(req),
          expected = revision(b.expected_revision),
          s = snapshot(b.snapshot, id),
          key = uuid(req.headers.get("idempotency-key")),
          hash = digest(JSON.stringify({ id, expected, s }));
        const previous = await c.query(
          "SELECT * FROM diary.memories WHERE vault_id=$1 AND id=$2",
          [p.vault, id],
        );
        const m = previous.rows[0];
        if (m?.deleted_at) throw new HttpError(410, "DELETED");
        const replay = await c.query(
          "SELECT * FROM diary.requests WHERE vault_id=$1 AND key=$2",
          [p.vault, key],
        );
        if (replay.rowCount) {
          if (replay.rows[0].digest !== hash)
            throw new HttpError(409, "IDEMPOTENCY_CONFLICT");
          return json(replay.rows[0].response);
        }
        if ((m?.revision ?? 0) !== expected)
          throw new HttpError(409, "REVISION_CONFLICT");
        if (
          m &&
          (m.snapshot.sha256 !== s.sha256 ||
            m.snapshot.duration_ms !== s.duration_ms ||
            !isDeepStrictEqual(m.snapshot.context, s.context) ||
            s.revision < m.snapshot.revision ||
            m.snapshot.raw_history.some(
              (x: string, i: number) => s.raw_history[i] !== x,
            ) ||
            (s.revision === m.snapshot.revision &&
              !isDeepStrictEqual(m.snapshot, s)))
        )
          throw new HttpError(409, "IMMUTABLE_CONFLICT");
        const next = expected + 1;
        await c.query(
          "INSERT INTO diary.memories(vault_id,id,snapshot,revision) VALUES($1,$2,$3,$4) ON CONFLICT(vault_id,id) DO UPDATE SET snapshot=excluded.snapshot,revision=excluded.revision,updated_at=now()",
          [p.vault, id, s, next],
        );
        await changed(c, p, id);
        const response = {
          id,
          revision: next,
          audio_ready: m?.audio_ready ?? false,
        };
        await c.query(
          "INSERT INTO diary.requests(vault_id,key,digest,response) VALUES($1,$2,$3,$4)",
          [p.vault, key, hash, response],
        );
        return json(response);
      }
      const m = await memory(c, p, id);
      if (path.length === 2) {
        if (method === "GET") return json(m);
        if (method === "DELETE") {
          const b = await body(req);
          if (revision(b.expected_revision) !== m.revision)
            throw new HttpError(409, "REVISION_CONFLICT");
          await c.query(
            "UPDATE diary.memories SET deleted_at=now(),snapshot=$3,revision=revision+1 WHERE vault_id=$1 AND id=$2",
            [p.vault, id, {}],
          );
          await c.query(
            "UPDATE diary.photos SET deleted_at=now() WHERE vault_id=$1 AND session_id=$2",
            [p.vault, id],
          );
          await c.query(
            "INSERT INTO diary.purge_jobs(vault_id,session_id) VALUES($1,$2)",
            [p.vault, id],
          );
          await changed(c, p, id);
          return json({
            deleted: true,
            purge: "pending",
            device_copies: "pending_until_sync",
          });
        }
      }
      const k = { vaultId: p.vault, sessionId: id, chunkId: id };
      if (path[2] === "audio" && path.length === 3) {
        if (method === "PUT") {
          if (!p.device) throw new HttpError(403, "VEHICLE_REQUIRED");
          const b = await bytes(req, 42 * 1024 * 1024),
            meta = inspectWav(b);
          if (
            meta.sampleRate !== 16000 ||
            meta.channels !== 1 ||
            Math.floor(meta.durationMs) !== m.snapshot.duration_ms ||
            digest(b) !== m.snapshot.sha256
          )
            throw new HttpError(422, "AUDIO_MISMATCH");
          await audio().putImmutable(
            k,
            (async function* () {
              yield b;
            })(),
            m.snapshot.sha256,
          );
          if (!m.audio_ready) {
            await c.query(
              "UPDATE diary.memories SET audio_ready=true,revision=revision+1 WHERE vault_id=$1 AND id=$2",
              [p.vault, id],
            );
            await changed(c, p, id);
          }
          return json({
            ready: true,
            revision: m.revision + (m.audio_ready ? 0 : 1),
          });
        }
        if (method === "GET") {
          if (!m.audio_ready) throw new HttpError(409, "AUDIO_PENDING");
          const { bytes: size } = await audio().stat(k),
            range = parseRange(req.headers.get("range"), size),
            b = await audio().readRange(k, range);
          return new Response(new Uint8Array(b), {
            status: range ? 206 : 200,
            headers: {
              "content-type": "audio/wav",
              "cache-control": "private, no-store",
              "accept-ranges": "bytes",
              "content-length": String(b.length),
              ...(range
                ? {
                    "content-range": `bytes ${range.start}-${range.end}/${size}`,
                  }
                : {}),
            },
          });
        }
      }
      if (path[2] === "photos") {
        if (path.length === 3 && method === "POST") {
          owner(p);

          const photoId = uuid(req.headers.get("idempotency-key"));
          const uploadBytes = await bytes(req, 10 * 1024 * 1024);
          const uploadHash = digest(uploadBytes);
          const prev = await c.query(
            "SELECT id,session_id,deleted_at,input_sha256 FROM diary.photos WHERE vault_id=$1 AND id=$2",
            [p.vault, photoId],
          );
          if (prev.rowCount) {
            if (
              prev.rows[0].session_id !== id ||
              prev.rows[0].deleted_at ||
              prev.rows[0].input_sha256 !== uploadHash
            )
              throw new HttpError(409, "PHOTO_CONFLICT");
            return json(await memory(c, p, id));
          }
          if (m.photos!.length >= 8) throw new HttpError(409, "PHOTO_LIMIT");
          const input = uploadBytes;
          let output: Buffer;
          try {
            const pipeline = sharp(input, {
                limitInputPixels: 40000000,
                animated: false,
                failOn: "error",
              }),
              meta = await pipeline.metadata();
            if (!["jpeg", "png", "webp"].includes(meta.format ?? ""))
              throw Error();
            output = await pipeline
              .rotate()
              .resize({
                width: 1600,
                height: 1600,
                fit: "inside",
                withoutEnlargement: true,
              })
              .jpeg({ quality: 88 })
              .toBuffer();
          } catch {
            throw new HttpError(422, "INVALID_PHOTO");
          }
          const file = photoPath(p.vault, photoId);
          await mkdir(join(process.env.PHOTO_ROOT!, p.vault), {
            recursive: true,
            mode: 0o700,
          });
          const temp = `${file}.${randomUUID()}.tmp`;
          await writeFile(temp, output, { mode: 0o600, flag: "wx" });
          await rename(temp, file);
          await c.query(
            "INSERT INTO diary.photos(vault_id,id,session_id,bytes,sha256,input_sha256) VALUES($1,$2,$3,$4,$5,$6)",
            [p.vault, photoId, id, output.length, digest(output), uploadHash],
          );
          await c.query(
            "UPDATE diary.memories SET revision=revision+1 WHERE vault_id=$1 AND id=$2",
            [p.vault, id],
          );
          await changed(c, p, id);
          return json(await memory(c, p, id), 201);
        }
        if (path.length === 4) {
          const photoId = uuid(path[3]);
          if (!m.photos!.some((x: { id: string }) => x.id === photoId))
            throw new HttpError(404, "NOT_FOUND");
          if (method === "GET")
            return new Response(
              new Uint8Array(await readFile(photoPath(p.vault, photoId))),
              {
                headers: {
                  "content-type": "image/jpeg",
                  "cache-control": "private, no-store",
                  "x-content-type-options": "nosniff",
                },
              },
            );
          if (method === "DELETE") {
            await c.query(
              "UPDATE diary.photos SET deleted_at=now() WHERE vault_id=$1 AND id=$2",
              [p.vault, photoId],
            );
            await c.query(
              "INSERT INTO diary.purge_jobs(vault_id,session_id,photo_id) VALUES($1,$2,$3)",
              [p.vault, id, photoId],
            );
            await c.query(
              "UPDATE diary.memories SET revision=revision+1 WHERE vault_id=$1 AND id=$2",
              [p.vault, id],
            );
            await changed(c, p, id);
            return json(await memory(c, p, id));
          }
        }
      }
      throw new HttpError(404, "NOT_FOUND");
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function purgeOnce(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const job = (await c.query("SELECT * FROM diary.claim_purge()")).rows[0];
    if (!job) {
      await c.query("COMMIT");
      return false;
    }
    await c.query("SELECT set_config('diary.vault_id',$1,true)", [
      job.vault_id,
    ]);
    await c.query("SELECT id FROM diary.vaults WHERE id=$1 FOR UPDATE", [
      job.vault_id,
    ]);
    if (job.photo_id)
      await unlink(photoPath(job.vault_id, job.photo_id)).catch((e) => {
        if (e.code !== "ENOENT") throw e;
      });
    else {
      await audio().delete({
        vaultId: job.vault_id,
        sessionId: job.session_id,
        chunkId: job.session_id,
      });
      const photos = await c.query(
        "SELECT id FROM diary.photos WHERE vault_id=$1 AND session_id=$2",
        [job.vault_id, job.session_id],
      );
      for (const photo of photos.rows)
        await unlink(photoPath(job.vault_id, photo.id)).catch((e) => {
          if (e.code !== "ENOENT") throw e;
        });
    }
    await c.query("UPDATE diary.purge_jobs SET done_at=now() WHERE id=$1", [
      job.id,
    ]);
    await c.query("COMMIT");
    return true;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
