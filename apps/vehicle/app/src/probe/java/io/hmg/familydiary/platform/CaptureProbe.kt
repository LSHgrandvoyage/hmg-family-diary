package io.hmg.familydiary.platform

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import io.hmg.familydiary.capture.PcmWave
import java.io.File
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/** Bench-only AudioRecord input. Never substitutes for a real parked-state provider. */
class CaptureProbe(private val directory: File) {
    data class Result(val file: File?, val bytes: Long, val interrupted: Boolean, val error: String?)
    private val handler = Handler(Looper.getMainLooper())
    private val running = AtomicBoolean(false)
    @Volatile private var recorder: AudioRecord? = null
    @Volatile private var interrupted = false
    @Volatile var busy = false; private set

    @SuppressLint("MissingPermission") // Activity requests permission before this explicit action.
    fun start(onProgress: (Long) -> Unit, onResult: (Result) -> Unit) {
        check(!busy)
        directory.mkdirs()
        check(directory.usableSpace > 64L * 1024 * 1024) { "LOW_STORAGE" }
        val minimum = AudioRecord.getMinBufferSize(PcmWave.SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0) { "FORMAT_UNSUPPORTED" }
        val input = AudioRecord(MediaRecorder.AudioSource.MIC, PcmWave.SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum, 6_400))
        if (input.state != AudioRecord.STATE_INITIALIZED) {
            input.release(); error("MIC_INITIALIZATION_FAILED")
        }
        try { input.startRecording(); check(input.recordingState == AudioRecord.RECORDSTATE_RECORDING) }
        catch (error: Exception) { input.release(); throw error }
        val id = UUID.randomUUID().toString()
        recorder = input; interrupted = false; busy = true; running.set(true)
        Thread({
            var writer: PcmWave.Writer? = null
            var result: Result
            try {
                writer = PcmWave.Writer(File(directory, "$id.partial"))
                val buffer = ByteArray(3_200)
                var lastProgress = 0L
                while (running.get()) {
                    val size = input.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
                    if (size < 0) {
                        if (!running.get()) break
                        error("MIC_READ_$size")
                    }
                    if (size == 0) continue
                    writer.append(buffer, size)
                    if (writer.bytes - lastProgress >= PcmWave.BYTES_PER_SECOND) {
                        lastProgress = writer.bytes
                        val duration = writer.bytes * 1_000 / PcmWave.BYTES_PER_SECOND
                        handler.post { onProgress(duration) }
                    }
                    // Bench disk bound, explicitly shown before capture. Not a product input format limit.
                    if (writer.bytes >= 21L * 60 * PcmWave.BYTES_PER_SECOND) {
                        interrupted = true; running.set(false)
                    }
                }
                val suffix = if (interrupted) ".interrupted.wav" else ".wav"
                val file = writer.finish(File(directory, id + suffix))
                result = Result(file, writer.bytes, interrupted, null)
            } catch (error: Exception) {
                result = Result(null, writer?.bytes ?: 0L, true, error.javaClass.simpleName)
            } finally {
                running.set(false)
                runCatching { input.stop() }
                input.release(); recorder = null
                runCatching { writer?.close() }
                busy = false
            }
            handler.post { onResult(result) }
        }, "capture-probe").start()
    }

    fun stop(wasInterrupted: Boolean = false) {
        if (!busy) return
        if (wasInterrupted) interrupted = true
        running.set(false)
        runCatching { recorder?.stop() }
    }
}
