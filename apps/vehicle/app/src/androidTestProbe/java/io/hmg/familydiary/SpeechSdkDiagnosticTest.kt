package io.hmg.familydiary

import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import ai.pleos.playground.stt.SpeechToText
import ai.pleos.playground.stt.constant.ErrorType
import ai.pleos.playground.stt.constant.Mode
import ai.pleos.playground.stt.listener.OnInitializeListener
import ai.pleos.playground.stt.listener.ResultListener
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** SYNTHETIC ASSETS ONLY. Never reads the user's capture-probe directory or opens a microphone. */
class SpeechSdkDiagnosticTest {
    @Test fun compareSavedPcmTransports() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val wave = instrumentation.context.assets.open("synthetic-stt.wav").use { it.readBytes() }
        assertEquals("RIFF", String(wave, 0, 4))
        val pcm = wave.copyOfRange(44, wave.size)
        assertTrue(pcm.size in 1..500_000)
        val report = JSONArray()
        for ((name, chunkSize, delay) in listOf(
            Triple("stream100", 3200, 100L), Triple("batch", pcm.size, 0L),
            Triple("stream200", 6400, 200L)
        )) {
            val events = JSONArray()
            val sent = AtomicInteger(0)
            val start = SystemClock.elapsedRealtime()
            fun event(kind: String, text: String? = null, final: Boolean? = null, on: Long? = null, off: Long? = null) {
                synchronized(events) {
                    events.put(JSONObject().put("ms", SystemClock.elapsedRealtime() - start)
                        .put("kind", kind).put("sent", sent.get()).put("text", text)
                        .put("final", final).put("on", on).put("off", off))
                }
            }
            val initialized = CountDownLatch(1)
            var failure: String? = null
            val sdk = SpeechToText(instrumentation.targetContext, Mode.ON_DEVICE)
            val listener = object : ResultListener {
                override fun onReady() { event("ready") }
                override fun onStartedRecognition() { event("started") }
                override fun onEndedRecognition() { event("ended") }
                override fun onUpdated(stt: String, completed: Boolean) { event("text", stt, completed) }
                override fun onUpdatedEpdData(on: Long, off: Long) { event("epd", on = on, off = off) }
                override fun onUpdatedRms(rms: Double) = Unit
                override fun onError(errorType: ErrorType) { event("error", errorType.name) }
            }
            try {
                instrumentation.runOnMainSync {
                    sdk.initialize(object : OnInitializeListener {
                        override fun onSuccess() { event("initialized"); initialized.countDown() }
                        override fun onFailure(errorType: ErrorType) { failure = errorType.name; initialized.countDown() }
                    })
                }
                assertTrue("SDK init timeout", initialized.await(15, TimeUnit.SECONDS))
                assertNull(failure)
                instrumentation.runOnMainSync { sdk.setLocale(Locale.KOREA); sdk.addListener(listener) }
                Thread.sleep(500)
                var offset = 0
                while (offset < pcm.size) {
                    val end = minOf(offset + chunkSize, pcm.size)
                    sdk.sendAudio(pcm.copyOfRange(offset, end))
                    sent.set(end); offset = end
                    if (delay > 0) Thread.sleep(delay)
                }
                event("completeSend"); sdk.completeAudioSend()
                // Diagnostic deliberately keeps listening after end/final, unlike the UI timeout.
                Thread.sleep(8_000)
            } finally {
                instrumentation.runOnMainSync { sdk.removeListener(listener); sdk.stop(); sdk.release() }
                report.put(JSONObject().put("mode", name).put("bytes", pcm.size).put("events", events))
                File(instrumentation.targetContext.filesDir, "synthetic-stt-diagnostic.json").writeText(report.toString(2))
            }
            Thread.sleep(1_000)
        }
        assertEquals(3, report.length()) // This is a transport investigation, not a quality pass.
    }
}
