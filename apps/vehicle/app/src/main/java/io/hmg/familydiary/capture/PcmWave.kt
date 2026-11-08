package io.hmg.familydiary.capture

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest

/** Fixed capture format; the WAV header is never sent to STT. */
object PcmWave {
    const val SAMPLE_RATE = 16_000
    const val BYTES_PER_SECOND = 32_000
    const val HEADER_BYTES = 44

    fun header(bytes: Long): ByteArray {
        require(bytes in 0..0xffff_ffffL - 36 && bytes % 2L == 0L)
        return ByteBuffer.allocate(HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray()); putInt((bytes + 36).toInt()); put("WAVEfmt ".toByteArray())
            putInt(16); putShort(1); putShort(1); putInt(SAMPLE_RATE)
            putInt(BYTES_PER_SECOND); putShort(2); putShort(16)
            put("data".toByteArray()); putInt(bytes.toInt())
        }.array()
    }

    /** Validate our exact format and length before either playback or recognition. */
    fun payloadBytes(file: File): Long {
        val bytes = file.length() - HEADER_BYTES
        require(bytes > 0 && bytes % 2L == 0L) { "EMPTY_OR_TRUNCATED_AUDIO" }
        RandomAccessFile(file, "r").use { input ->
            val actual = ByteArray(HEADER_BYTES)
            input.readFully(actual)
            require(actual.contentEquals(header(bytes))) { "INVALID_WAVE" }
        }
        return bytes
    }

    fun stream(file: File, send: (ByteArray) -> Unit): Long {
        val bytes = payloadBytes(file)
        RandomAccessFile(file, "r").use { input ->
            input.seek(HEADER_BYTES.toLong())
            var remaining = bytes
            while (remaining > 0) {
                val chunk = ByteArray(minOf(3_200L, remaining).toInt())
                input.readFully(chunk)
                send(chunk)
                remaining -= chunk.size
            }
        }
        return bytes
    }

    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            while (true) {
                val size = input.read(buffer)
                if (size < 0) break
                digest.update(buffer, 0, size)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    class Writer(private val partial: File) : AutoCloseable {
        private val output = RandomAccessFile(partial, "rw")
        var bytes = 0L; private set
        private var lastSync = 0L
        init { require(output.length() == 0L); output.write(header(0)) }
        fun append(buffer: ByteArray, size: Int) {
            require(size > 0 && size <= buffer.size && size % 2 == 0)
            output.seek(HEADER_BYTES + bytes)
            output.write(buffer, 0, size)
            bytes += size
            if (bytes - lastSync >= BYTES_PER_SECOND) checkpoint()
        }
        fun checkpoint() {
            output.seek(0); output.write(header(bytes)); output.fd.sync(); lastSync = bytes
        }
        fun finish(destination: File): File {
            require(bytes > 0) { "EMPTY_AUDIO" }
            require(!destination.exists()) { "DESTINATION_EXISTS" }
            checkpoint(); output.close()
            check(partial.renameTo(destination)) { "FINALIZE_FAILED" }
            return destination
        }
        override fun close() { output.close() }
    }
}
