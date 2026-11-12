package io.hmg.familydiary.platform

import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.net.URI
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate

/** User-approved, app-private local test CA. No tokens or private keys in the document. */
data class ServerSettings(val origin: String, val pem: String) {
    val certificate: X509Certificate get() = CertificateFactory.getInstance("X.509")
        .generateCertificate(pem.byteInputStream()) as X509Certificate
    val fingerprint: String get() = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
        .joinToString(":") { "%02X".format(it) }
    fun json() = JSONObject().put("schema_version", 1).put("origin", origin).put("ca_pem", pem)
    fun save(root: File, paired: Boolean) {
        if (paired) require(read(root).certificate.encoded.contentEquals(certificate.encoded)) {
            "연결된 보관함과 다른 서버 인증서예요. 기존 서버의 설정을 사용해 주세요."
        }
        val file = AtomicFile(File(root, "server-settings.json"))
        val out = file.startWrite()
        try { out.write(json().toString().toByteArray()); file.finishWrite(out) }
        catch (e: Exception) { file.failWrite(out); throw e }
    }
    companion object {
        const val MAX_BYTES = 32768
        fun parse(bytes: ByteArray): ServerSettings {
            require(bytes.size <= MAX_BYTES) { "설정 파일은 32KB 이하여야 해요." }
            val j = JSONObject(String(bytes, Charsets.UTF_8))
            require(j.keys().asSequence().toSet() == setOf("schema_version", "origin", "ca_pem"))
            require(j.getInt("schema_version") == 1)
            val origin = j.getString("origin"); val uri = URI(origin)
            require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.rawPath.isNullOrEmpty()
                && uri.rawQuery == null && uri.rawFragment == null && uri.rawUserInfo == null
                && (uri.port == -1 || uri.port in 1..65535)) { "HTTPS 서버 주소를 확인해 주세요." }
            val result = ServerSettings(origin, j.getString("ca_pem"))
            require(!result.pem.contains("PRIVATE KEY"))
            result.certificate.checkValidity()
            require(result.certificate.basicConstraints >= 0) { "유효한 서버 CA 인증서가 필요해요." }
            return result
        }
        fun configured(root: File) = File(root, "server-settings.json").isFile || File(root, "server-settings.json.bak").isFile ||
            (File(root, "sync-origin.txt").isFile && File(root, "sync-ca.crt").isFile)
        fun read(root: File): ServerSettings {
            val file = AtomicFile(File(root, "server-settings.json"))
            if (file.baseFile.exists() || File(file.baseFile.path + ".bak").exists())
                return file.openRead().use { parse(it.readBytes()) }
            return ServerSettings(File(root, "sync-origin.txt").readText().trim(), File(root, "sync-ca.crt").readText())
        }
    }
}
