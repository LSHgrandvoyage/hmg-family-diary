package io.hmg.familydiary.platform

import android.content.Context
import android.os.Handler
import android.os.Looper
import ai.pleos.playground.stt.SpeechToText
import ai.pleos.playground.stt.constant.ErrorType
import ai.pleos.playground.stt.constant.Mode
import ai.pleos.playground.stt.listener.OnInitializeListener
import ai.pleos.playground.stt.listener.ResultListener
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.SpeechTranscript
import java.io.File
import java.util.Locale

/** Uses saved PCM, never SDK request() (which opens a separate microphone). */
class SpeechProbe(private val context: Context) {
    private val handler = Handler(Looper.getMainLooper())
    private val lock = Any()
    @Volatile private var generation = 0
    private var sdk: SpeechToText? = null
    private var listener: ResultListener? = null
    private var sender: Thread? = null
    var busy = false; private set

    fun run(file: File?, onStatus: (String) -> Unit, onDone: () -> Unit) {
        cancel()
        val token = generation
        busy = true
        fun event(action: () -> Unit) { handler.post { if (token == generation) action() } }
        fun finish(message: String) = event { onStatus(message); cancel(); onDone() }
        val speech = try { SpeechToText(context.applicationContext, Mode.ON_DEVICE) }
            catch (_: Exception) { finish("STT 객체 생성 실패 · SDK/서비스 호환성 확인 필요"); return }
        sdk = speech
        val transcript = SpeechTranscript()
        var settleRevision = 0
        fun maybeFinish() {
            if (!transcript.canFinish) return
            val revision = ++settleRevision
            handler.postDelayed({
                if (token == generation && revision == settleRevision && transcript.canFinish) {
                    val heading = when {
                        transcript.partial.isNotBlank() -> "STT 종료 · 최종 확정 미수신 구간 있음"
                        transcript.completedCount > 0 -> "STT 최종 결과 수신 · ${transcript.completedCount}개 구간"
                        else -> "STT 종료 · 인식문 없음"
                    }
                    onStatus("$heading\n${transcript.text}")
                    cancel(); onDone()
                }
            }, 500)
        }
        val resultListener = object : ResultListener {
            override fun onReady() = event { onStatus("STT 준비됨 · 저장 PCM 입력 대기") }
            override fun onStartedRecognition() = event { transcript.started(); settleRevision++ }
            override fun onUpdated(stt: String, completed: Boolean) = event {
                // Transcript is visible only here: never Logcat, disk, or network.
                transcript.updated(stt, completed)
                onStatus("인식 중 · 확정 ${transcript.completedCount}개 구간\n${transcript.text}")
                maybeFinish()
            }
            override fun onUpdatedEpdData(on: Long, off: Long) = Unit // byte offsets; full alignment is G1 pending.
            override fun onUpdatedRms(rms: Double) = Unit
            override fun onEndedRecognition() = event {
                transcript.ended(); maybeFinish()
            }
            override fun onError(errorType: ErrorType) { finish("STT 실패 · ${errorType.name}\n원본 파일은 보존됩니다.") }
        }
        listener = resultListener
        onStatus("Pleos ON_DEVICE 연결 중")
        val timeout = Runnable {
            if (token == generation) {
                onStatus("STT 응답 시간 초과 · 원본 파일 보존"); cancel(); onDone()
            }
        }
        handler.postDelayed(timeout, 15_000)
        try {
            speech.initialize(object : OnInitializeListener {
                override fun onFailure(errorType: ErrorType) { finish("STT 초기화 실패 · ${errorType.name}") }
                override fun onSuccess() = event {
                    handler.removeCallbacks(timeout)
                    try {
                        speech.setLocale(Locale.KOREA)
                        speech.addListener(resultListener)
                        if (file == null) { finish("Pleos ON_DEVICE 초기화 성공 · 음성 인식은 아직 미실행"); return@event }
                        val bytes = PcmWave.payloadBytes(file)
                        onStatus("저장한 원본 PCM 전송 중 · $bytes bytes")
                        handler.postDelayed(timeout, bytes * 1_000 / PcmWave.BYTES_PER_SECOND + 30_000)
                        sender = Thread({
                            try {
                                PcmWave.stream(file) { chunk ->
                                    synchronized(lock) {
                                        if (token != generation) throw InterruptedException()
                                        speech.sendAudio(chunk)
                                    }
                                    Thread.sleep(chunk.size * 1_000L / PcmWave.BYTES_PER_SECOND)
                                }
                                synchronized(lock) { if (token == generation) speech.completeAudioSend() }
                                event { transcript.sentAll(); maybeFinish() }
                            } catch (_: InterruptedException) {
                                // Explicit cancellation; no automatic resume.
                            } catch (_: Exception) { finish("STT PCM 전송 실패 · 원본 파일 보존") }
                        }, "speech-probe").also { it.start() }
                    } catch (_: Exception) { finish("STT 설정 실패 · 원본 파일 보존") }
                }
            })
        } catch (_: Exception) { finish("STT 초기화 호출 실패 · SDK/서비스 호환성 확인 필요") }
    }

    fun cancel() {
        synchronized(lock) {
            generation++; busy = false
            sender?.interrupt(); sender = null
            handler.removeCallbacksAndMessages(null)
            runCatching { listener?.let { sdk?.removeListener(it) } }
            runCatching { sdk?.stop() }
            runCatching { sdk?.release() }
            sdk = null; listener = null
        }
    }
}
