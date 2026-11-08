package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.SpeechProbe
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** Only generated assets, no microphone or user's recordings. */
class SpeechProbeDeviceTest {
    private val expected = "오늘 가족과 바다에 갔어요 아이는 파도가 무서웠고 저는 바다가 좋았어요"
    private fun normalized(value: String) = value.replace(Regex("[\\s.,!?]"), "")

    @Test fun freeformKeepsEventsAndSpokenCorrection() {
        val expectedFreeform = "오늘 아침에는 가족과 공원에 갔어요. 아이는 자전거를 타고 저는 나무 그늘에서 쉬었어요. 점심에는 김밥을 먹었어요. 아, 점심이 아니라 아침이었어요. 어제 들렀던 카페에서는 따뜻한 우유를 마셨어요. 오늘 바다에서는 아이가 파도를 무서워했지만 저는 바다가 좋았어요. 다음 주에는 할머니를 만나러 가고 싶어요. 그리고 집에 돌아갈 때 우산을 챙겨야 해요."
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val file = File(instrumentation.targetContext.cacheDir, "synthetic-freeform-${UUID.randomUUID()}.wav")
        file.writeBytes(instrumentation.context.assets.open("synthetic-freeform.wav").use { it.readBytes() })
        val before = PcmWave.sha256(file)
        val done = CountDownLatch(1)
        var result = ""
        val probe = SpeechProbe(instrumentation.targetContext)
        try {
            instrumentation.runOnMainSync {
                probe.run(file, onStatus = { result = it }, onDone = { done.countDown() })
            }
            assertTrue("freeform timeout", done.await(75, TimeUnit.SECONDS))
            File(instrumentation.targetContext.filesDir, "synthetic-stt-freeform.json").writeText(
                JSONObject().put("synthetic", true).put("sha256", before)
                    .put("pcmBytes", PcmWave.payloadBytes(file)).put("expected", expectedFreeform)
                    .put("finalStatus", result).toString(2))
            assertEquals(before, PcmWave.sha256(file))
            assertTrue("Not finalized: $result", result.startsWith("STT 최종 결과 수신"))
            assertEquals(normalized(expectedFreeform), normalized(result.substringAfter('\n')))
        } finally {
            instrumentation.runOnMainSync { probe.cancel() }
            file.delete()
        }
    }

    @Test fun cancelStopsCallbacksAndAllowsExplicitRetry() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val file = File(instrumentation.targetContext.cacheDir, "synthetic-retry-${UUID.randomUUID()}.wav")
        file.writeBytes(instrumentation.context.assets.open("synthetic-stt.wav").use { it.readBytes() })
        val before = PcmWave.sha256(file)
        val callbacks = AtomicInteger()
        val sending = CountDownLatch(1)
        val done = CountDownLatch(1)
        var result = ""
        val probe = SpeechProbe(instrumentation.targetContext)
        try {
            instrumentation.runOnMainSync {
                probe.run(file, onStatus = {
                    callbacks.incrementAndGet()
                    if (it.startsWith("저장한 원본 PCM 전송 중")) sending.countDown()
                }, onDone = { callbacks.incrementAndGet() })
            }
            assertTrue("initial send timeout", sending.await(20, TimeUnit.SECONDS))
            Thread.sleep(700)
            instrumentation.runOnMainSync { probe.cancel(); assertFalse(probe.busy) }
            val cancelledCount = callbacks.get()
            Thread.sleep(1500)
            assertEquals("Late callback after cancel", cancelledCount, callbacks.get())
            instrumentation.runOnMainSync {
                probe.run(file, onStatus = { result = it }, onDone = { done.countDown() })
            }
            assertTrue("retry timeout", done.await(40, TimeUnit.SECONDS))
            assertEquals("Old run callback during retry", cancelledCount, callbacks.get())
            assertTrue("Retry not finalized: $result", result.startsWith("STT 최종 결과 수신"))
            assertEquals(normalized(expected), normalized(result.substringAfter('\n')))
            assertEquals("Original mutated", before, PcmWave.sha256(file))
        } finally {
            instrumentation.runOnMainSync { probe.cancel() }
            file.delete()
        }
    }

    @Test fun fullFileRepeatedSpeechAndImmediateStopKeepWords() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val wave = instrumentation.context.assets.open("synthetic-stt.wav").use { it.readBytes() }
        val payload = wave.copyOfRange(44, wave.size)
        val reports = JSONArray()
        val cases = listOf(
            Triple("short", payload, 1),
            Triple("repeated", payload + payload + payload, 3),
            Triple("noTrailingSilence", payload.copyOfRange(0, payload.size - 64_000), 1)
        )
        for ((name, pcm, repetitions) in cases) {
            val file = File(instrumentation.targetContext.cacheDir, "synthetic-stt-${UUID.randomUUID()}.wav")
            file.writeBytes(PcmWave.header(pcm.size.toLong()) + pcm)
            val before = PcmWave.sha256(file)
            val done = CountDownLatch(1)
            val updates = JSONArray()
            var result = ""
            val probe = SpeechProbe(instrumentation.targetContext)
            try {
                instrumentation.runOnMainSync {
                    probe.run(file, onStatus = { result = it; updates.put(it) }, onDone = { done.countDown() })
                }
                assertTrue("adapter timeout: $name", done.await(pcm.size / 32000L + 35, TimeUnit.SECONDS))
                reports.put(JSONObject().put("case", name).put("pcmBytes", pcm.size)
                    .put("finalStatus", result).put("updates", updates))
                File(instrumentation.targetContext.filesDir, "synthetic-stt-adapter.json").writeText(reports.toString(2))
                assertEquals("Original mutated: $name", before, PcmWave.sha256(file))
                assertTrue("Not finalized ($name): $result", result.startsWith("STT 최종 결과 수신"))
                val actual = result.substringAfter('\n')
                assertEquals("Transcript mismatch ($name)", normalized(List(repetitions) { expected }.joinToString(" ")), normalized(actual))
            } finally {
                instrumentation.runOnMainSync { probe.cancel() }
                file.delete()
            }
        }
    }
}
