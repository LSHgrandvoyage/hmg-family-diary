package io.hmg.familydiary.platform

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class DiaryProbe(private val context: Context) {
    private val handler = Handler(Looper.getMainLooper())
    private val lock = Any()
    @Volatile private var generation = 0
    @Volatile private var connection: HttpURLConnection? = null
    var busy = false; private set
    fun run(input: JSONObject, done: (JSONObject?, String?) -> Unit) {
        cancel(); val token = generation; busy = true
        Thread({
            var result: JSONObject? = null; var error: String? = null
            var conn: HttpURLConnection? = null
            try {
                val credential = File(context.filesDir, "diary-probe-token").readText().trim()
                require(Regex("[a-f0-9]{64}").matches(credential))
                conn = URL("http://localhost:4319/draft").openConnection() as HttpURLConnection
                synchronized(lock) {
                    if (token != generation) return@Thread
                    connection = conn
                }
                conn.apply {
                    requestMethod = "POST"; instanceFollowRedirects = false; connectTimeout = 5000; readTimeout = 100000
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Authorization", "Bearer $credential"); doOutput = true
                }
                conn.outputStream.use { it.write(input.toString().toByteArray(Charsets.UTF_8)) }
                val success = conn.responseCode == 200
                val body = (if (success) conn.inputStream else conn.errorStream)?.use {
                    val bytes = it.readBytesLimited(1_000_000); JSONObject(String(bytes, Charsets.UTF_8))
                }
                if (success) result = body ?: throw IllegalStateException() else error = message(body?.optString("error"))
            } catch (_: Exception) { error = "생성 서버에 연결하지 못했어요. 맥북 서버와 연결 설정을 확인한 뒤 다시 시도해 주세요." }
            finally { conn?.disconnect(); if (connection === conn) connection = null }
            handler.post { if (token == generation) { busy = false; done(result, error) } }
        }, "diary-probe").start()
    }
    fun cancel() { synchronized(lock) { generation++; busy = false; connection?.disconnect(); connection = null; handler.removeCallbacksAndMessages(null) } }
    private fun java.io.InputStream.readBytesLimited(max: Int): ByteArray {
        val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
        while (true) { val count = read(buffer); if (count < 0) break; require(out.size() + count <= max); out.write(buffer, 0, count) }
        return out.toByteArray()
    }
    private fun message(code: String?) = when (code) {
        "NOT_CONFIGURED" -> "OpenAI API 키·모델이 아직 설정되지 않았어요. 확인문은 이 기기에 보관했어요."
        "PROVIDER_AUTH" -> "OpenAI 인증·모델 접근 권한을 확인해 주세요. 확인문은 보관했어요."
        "REFUSED" -> "모델이 초안을 만들지 못했어요. 확인문과 원본은 그대로 남아 있어요."
        "INCOMPLETE", "INVALID_OUTPUT", "UNVERIFIED_ALIGNMENT" -> "완전한 근거가 있는 초안을 받지 못했어요. 이전 초안을 유지했어요."
        "RATE_LIMITED", "BUSY" -> "잠시 뒤 다시 생성해 주세요. 확인문은 보관했어요."
        "INVALID_INPUT" -> "확인문·화자·입력 길이를 확인해 주세요. 원본은 그대로 남아 있어요."
        else -> "생성을 마치지 못했어요. 연결을 확인하고 다시 시도해 주세요."
    }
}
