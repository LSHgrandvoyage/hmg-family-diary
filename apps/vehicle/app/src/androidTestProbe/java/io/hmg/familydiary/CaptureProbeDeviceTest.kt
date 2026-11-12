package io.hmg.familydiary

import android.content.Intent
import android.os.SystemClock
import androidx.test.platform.app.InstrumentationRegistry
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import io.hmg.familydiary.capture.PcmWave
import java.io.File
import org.junit.Assert.*
import org.junit.Test

/** Run only on the bench with host microphone disabled. No real speech is required. */
class CaptureProbeDeviceTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    @Test fun captureStopAndParkLossPreservePlayableOriginals() {
        val directory = File(instrumentation.targetContext.filesDir, "capture-probe")
        val before = directory.listFiles()?.toSet() ?: emptySet()
        val activity = instrumentation.startActivitySync(
            Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ) as MainActivity
        fun views(view: View): List<View> = listOf(view) + if (view is ViewGroup)
            (0 until view.childCount).flatMap { views(view.getChildAt(it)) } else emptyList()
        fun all() = views(activity.window.decorView)
        fun button(text: String) = all().filterIsInstance<Button>().first { it.text.toString() == text }
        fun checkboxes() = activity.gateTestControls()
        fun ui(action: () -> Unit) { instrumentation.runOnMainSync(action) }
        fun finals() = directory.listFiles()?.filter { it !in before && it.name.endsWith(".wav") } ?: emptyList()
        fun awaitFinals(count: Int) {
            val until = System.currentTimeMillis() + 5_000
            while (finals().size < count && System.currentTimeMillis() < until) Thread.sleep(100)
            assertEquals(count, finals().size)
            Thread.sleep(300) // Allow the result callback to unlock controls.
        }
        try {
            var startedAt = 0L
            var stoppedAt = 0L
            ui {
                assertFalse(button("녹음 시작").isEnabled)
                checkboxes().take(2).forEach { it.isChecked = true }
                button("녹음").performClick()
                assertTrue(button("녹음 시작").isEnabled)
                button("녹음 시작").performClick()
                startedAt = SystemClock.elapsedRealtime()
                assertFalse(button("녹음 시작").isEnabled)
            }
            Thread.sleep(30_000)
            ui {
                stoppedAt = SystemClock.elapsedRealtime()
                button("끝내고 이야기 확인").performClick()
            }
            awaitFinals(1)
            val original = finals().single()
            assertFalse(original.name.contains("interrupted"))
            val duration = PcmWave.payloadBytes(original).toDouble() / PcmWave.BYTES_PER_SECOND
            val elapsed = (stoppedAt - startedAt) / 1_000.0
            // UI dispatch can lag on the emulator: compare PCM time to the actual stop action.
            assertTrue("duration=$duration, elapsed=$elapsed", duration >= 28 && kotlin.math.abs(duration - elapsed) < 2)
            val checksum = PcmWave.sha256(original)
            ui { button("원본 재생").performClick() }
            Thread.sleep(1_000)
            ui { checkboxes().first().isChecked = false }
            ui {
                assertFalse(button("원본 재생").isEnabled)
                checkboxes().first().isChecked = true
                button("녹음").performClick()
                assertTrue(button("녹음 시작").isEnabled) // Playback did not auto-resume.
                button("녹음 시작").performClick()
            }
            Thread.sleep(3_000)
            ui { checkboxes().first().isChecked = false }
            awaitFinals(2)
            assertTrue(finals().any { it.name.endsWith(".interrupted.wav") })
            assertEquals(checksum, PcmWave.sha256(original))
            ui {
                assertFalse(button("녹음 시작").isEnabled)
                checkboxes().first().isChecked = true
                assertTrue(button("녹음 시작").isEnabled) // No automatic capture restart.
            }
        } finally {
            ui { activity.finish() }
            // Only this test's files; never delete existing user recordings.
            directory.listFiles()?.filter { it !in before }?.forEach {
                io.hmg.familydiary.platform.ReviewStore(File(instrumentation.targetContext.filesDir, "capture-review")).delete(it.name)
                io.hmg.familydiary.platform.MemoryContextStore(File(instrumentation.targetContext.filesDir, "memory-context")).delete(it.name)
                it.delete()
            }
        }
    }
}
