package io.hmg.familydiary.platform

import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Short disk-only transactions; never hold this lock during network I/O. No media or credentials. */
class SyncOutbox(root: File) {
    private val file = AtomicFile(File(root, "sync-outbox.json"))
    private val lock = locks.getOrPut(root.canonicalPath) { Any() }
    private fun read() = if (file.baseFile.exists() || File(file.baseFile.path + ".bak").exists())
        JSONObject(file.openRead().bufferedReader().use { it.readText() }) else JSONObject()
    private fun <T> transaction(write: Boolean = false, block: (JSONObject) -> T): T = synchronized(lock) {
        val state = read(); val result = block(state)
        if (write) {
            val stream = file.startWrite()
            try { stream.write(state.toString().toByteArray()); file.finishWrite(stream) }
            catch (e: Exception) { file.failWrite(stream); throw e }
        }
        result
    }
    private fun map(s: JSONObject, key: String) = s.optJSONObject(key) ?: JSONObject().also { s.put(key,it) }
    fun bind(name: String, vault: String): Boolean = transaction(true) { s ->
        val owners = map(s,"owners")
        if (!owners.has(name)) owners.put(name,vault)
        owners.getString(name) == vault
    }
    fun owner(name: String): String = transaction { map(it,"owners").optString(name) }
    fun deleted(name: String): Boolean = transaction { map(it,"deleted").has(name) }
    fun enqueue(name: String, vault: String, device: String, id: String, snapshot: JSONObject, base:JSONObject?=null) = transaction(true) { s ->
        if (map(s,"deleted").has(name) || map(s,"owners").optString(name) != vault) return@transaction
        val key = "$vault:$name:${snapshot.getInt("revision")}"
        val jobs = map(s,"jobs")
        if (!jobs.has(key)) jobs.put(key,JSONObject().put("key",key).put("file",name).put("vault",vault)
            .put("device",device).put("id",id).put("snapshot",snapshot).put("stage","snapshot")
            .put("request_key",UUID.randomUUID().toString()).put("base",base?:JSONObject.NULL).put("attempts",0).put("next_at",0))
    }
    fun jobs(vault: String, device: String): List<JSONObject> = transaction { s ->
        val jobs = map(s,"jobs")
        jobs.keys().asSequence().map { jobs.getJSONObject(it) }
            .filter { it.getString("vault")==vault && it.getString("device")==device }
            .sortedWith(compareBy<JSONObject> { if(it.optBoolean("delete")) 0 else 1 }.thenBy { it.optJSONObject("snapshot")?.optInt("revision") ?: 0 }).toList()
    }
    fun update(job: JSONObject) = transaction(true) { s ->
        val jobs=map(s,"jobs"); val key=job.getString("key")
        if(jobs.has(key)) jobs.put(key,job) // A concurrent delete cannot resurrect an upload.
    }
    fun finish(job: JSONObject) = transaction(true) { map(it,"jobs").remove(job.getString("key")); Unit }
    fun delete(name: String, vault: String, device: String, id: String) = transaction(true) { s ->
        map(s,"deleted").put(name,true)
        val jobs=map(s,"jobs")
        jobs.keys().asSequence().toList().filter { jobs.getJSONObject(it).getString("file")==name }.forEach { jobs.remove(it) }
        if(vault.isNotBlank() && device.isNotBlank()) {
            val key="$vault:$name:delete"
            jobs.put(key,JSONObject().put("key",key).put("file",name).put("vault",vault).put("device",device)
                .put("id",id).put("delete",true).put("next_at",0))
        }
    }
    /** Retry immutable audio validation, never clear text conflicts or tombstones. */
    fun retryAudioValidation(vault: String, device: String, once: Boolean): Boolean = transaction(true) { s ->
        var changed=false
        val jobs=map(s,"jobs")
        jobs.keys().forEach { key ->
            val job=jobs.getJSONObject(key)
            val legacy=job.optString("error")=="기록을 전송하지 못했어요. 내용을 확인해 주세요." && !job.has("error_code")
            if(job.optString("vault")==vault && job.optString("device")==device &&
                job.optString("stage")=="audio" && job.optBoolean("blocked") &&
                !map(s,"deleted").has(job.optString("file")) &&
                (legacy || job.optString("error_code")=="AUDIO_MISMATCH") &&
                (!once || !job.optBoolean("audio_validation_retry_v1"))) {
                job.put("audio_validation_retry_v1",true).put("next_at",0).put("blocked",false)
                job.remove("error");job.remove("error_code");changed=true
            }
        }
        changed
    }
    fun rebind(vault: String, device: String) = transaction(true) { s ->
        val jobs=map(s,"jobs")
        jobs.keys().forEach { key -> jobs.getJSONObject(key).takeIf { it.getString("vault")==vault }?.apply {
            put("device",device);put("next_at",0);remove("blocked");remove("error")
        } }
    }
    companion object { private val locks = java.util.concurrent.ConcurrentHashMap<String,Any>() }
}
