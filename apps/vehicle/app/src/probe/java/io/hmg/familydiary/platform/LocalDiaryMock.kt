package io.hmg.familydiary.platform

import org.json.JSONArray
import org.json.JSONObject

/** Explicit contest placeholder. Never substitutes for a failed real provider call. */
object LocalDiaryMock {
    const val TEXT = "AI 생성 일기 목업 입니다."
    fun generate(input: JSONObject): JSONObject {
        require(input.getString("schema_version") == "1")
        require(input.getString("session_id").isNotBlank() && input.getInt("input_revision") >= 0)
        val utterances = input.getJSONArray("utterances")
        require(utterances.length() > 0)
        val spans = JSONArray()
        for (i in 0 until utterances.length()) {
            val u = utterances.getJSONObject(i)
            require(u.getString("text").isNotBlank())
            val start = u.getLong("start_ms"); val end = u.getLong("end_ms")
            require(start >= 0 && end >= start)
            spans.put(JSONObject().put("utterance_id", u.getString("id")).put("start_ms", start).put("end_ms", end))
        }
        val statement = JSONObject().put("text", TEXT).put("audience", "shared")
            .put("member_id", JSONObject.NULL).put("source_spans", spans)
        val group = JSONObject().put("id", "mock-notice").put("label", "AI 생성 일기 목업")
            .put("place_label", JSONObject.NULL).put("date", JSONObject.NULL).put("time_relation", "unclear")
            .put("needs_review", false).put("statements", JSONArray().put(statement))
        val draft = JSONObject().put("schema_version", "1").put("groups", JSONArray().put(group))
            .put("excluded_spans", JSONArray()).put("review_items", JSONArray())
        return JSONObject().put("session_id", input.getString("session_id")).put("input_revision", input.getInt("input_revision"))
            .put("generation_mode", "mock").put("model", "mock-static-notice-v2").put("prompt_version", "mock-static-notice-v2").put("draft", draft)
    }
}
