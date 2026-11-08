package io.hmg.familydiary.platform

import android.util.AtomicFile
import io.hmg.familydiary.capture.PcmWave
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant

data class ReviewRecord(
    val id: String, val sha256: String, val durationMs: Long, val recordedAt: String,
    val rawHistory: List<String> = emptyList(), val text: String = "", val speaker: String = "",
    val revision: Int = 0, val confirmed: Int = -1,
    val draft: String? = null, val draftRevision: Int = -1, val accepted: Int = -1,
    val model: String = "", val promptVersion: String = ""
) {
    fun edit(text: String, speaker: String, recordedAt: String): ReviewRecord =
        if (this.text == text && this.speaker == speaker && this.recordedAt == recordedAt) this
        else copy(text = text, speaker = speaker, recordedAt = recordedAt, revision = revision + 1, confirmed = -1, accepted = -1)
    fun confirm(): ReviewRecord {
        require(text.isNotBlank() && speaker.isNotBlank() && speaker.length <= 40)
        Instant.parse(recordedAt)
        return copy(confirmed = revision)
    }
    fun withSpeech(value: String): ReviewRecord = copy(rawHistory = rawHistory + value).let {
        if (text.isBlank()) it.edit(value, speaker, recordedAt) else it
    }
    fun input(): JSONObject {
        require(confirmed == revision)
        return JSONObject().put("schema_version", "1").put("session_id", id).put("input_revision", revision)
            .put("recorded_at", recordedAt).put("timezone", "Asia/Seoul")
            .put("members", JSONArray().put(JSONObject().put("id", "speaker").put("display_name", speaker)))
            .put("utterances", JSONArray().put(JSONObject().put("id", "original").put("member_id", "speaker")
                .put("text", text).put("start_ms", 0).put("end_ms", durationMs)))
            .put("user_place_corrections", JSONArray()).put("user_group_corrections", JSONArray())
    }
    fun adopt(result: JSONObject): ReviewRecord {
        require(result.getString("session_id") == id && result.getInt("input_revision") == revision && confirmed == revision)
        val output = result.getJSONObject("draft")
        require(output.getString("schema_version") == "1")
        output.getJSONArray("groups"); output.getJSONArray("excluded_spans"); output.getJSONArray("review_items")
        return copy(draft = output.toString(), draftRevision = revision, accepted = -1,
            model = result.getString("model"), promptVersion = result.getString("prompt_version"))
    }
}

/** Emulator-only plain local store. Product encrypted LocalStore remains separate. */
class ReviewStore(private val directory: File) {
    private fun atomic(id: String): AtomicFile {
        require(Regex("[A-Za-z0-9.-]+\\.wav").matches(id))
        directory.mkdirs()
        return AtomicFile(File(directory, "$id.json"))
    }
    fun load(original: File): ReviewRecord {
        val file = atomic(original.name)
        val sha = PcmWave.sha256(original)
        val duration = PcmWave.payloadBytes(original) * 1000 / PcmWave.BYTES_PER_SECOND
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists())
            return ReviewRecord(original.name, sha, duration, Instant.ofEpochMilli(original.lastModified()).toString())
        val j = JSONObject(file.openRead().bufferedReader().use { it.readText() })
        require(j.getString("sha256") == sha && j.getLong("duration_ms") == duration) { "ORIGINAL_CHANGED" }
        val raw = j.getJSONArray("raw_history")
        return ReviewRecord(original.name, sha, duration, j.getString("recorded_at"),
            (0 until raw.length()).map { raw.getString(it) }, j.getString("text"), j.getString("speaker"),
            j.getInt("revision"), j.getInt("confirmed"), if (j.isNull("draft")) null else j.getString("draft"),
            j.getInt("draft_revision"), j.getInt("accepted"), j.optString("model"), j.optString("prompt_version"))
    }
    fun save(r: ReviewRecord) {
        val j = JSONObject().put("sha256", r.sha256).put("duration_ms", r.durationMs).put("recorded_at", r.recordedAt)
            .put("raw_history", JSONArray(r.rawHistory)).put("text", r.text).put("speaker", r.speaker)
            .put("revision", r.revision).put("confirmed", r.confirmed).put("draft", r.draft ?: JSONObject.NULL)
            .put("draft_revision", r.draftRevision).put("accepted", r.accepted).put("model", r.model).put("prompt_version", r.promptVersion)
        val file = atomic(r.id)
        val stream = file.startWrite()
        try { stream.write(j.toString().toByteArray(Charsets.UTF_8)); file.finishWrite(stream) }
        catch (e: Exception) { file.failWrite(stream); throw e }
    }
    fun delete(id: String) { atomic(id).delete() }
    fun clear(): Boolean = directory.listFiles()?.map { it.delete() }?.all { it } ?: true
}
