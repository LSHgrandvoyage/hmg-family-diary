package io.hmg.familydiary

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.ReviewStore
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

/** Only synthetic audio and text. Never captures a microphone or exports private files. */
class ReviewDeviceTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private fun fixture(): File {
        val dir = File(instrumentation.targetContext.filesDir, "capture-probe").apply { mkdirs() }
        val pcm = ByteArray(32000 * 8)
        return File(dir, "synthetic-review-${UUID.randomUUID()}.wav").apply { writeBytes(PcmWave.header(pcm.size.toLong()) + pcm) }
    }
    private fun store() = ReviewStore(File(instrumentation.targetContext.filesDir, "capture-review"))
    @Test fun editsPersistWithoutChangingAudioAndStaleResultsAreRejected() {
        val file = fixture(); val store = store(); val sha = PcmWave.sha256(file)
        try {
            val first = store.load(file).withSpeech("점심 먹었어. 아, 아침이었지.").edit("점심 먹었어. 아, 아침이었지.", "보호자", "2026-11-08T04:00:00Z").confirm()
            store.save(first)
            val restored = store.load(file)
            assertEquals(first, restored)
            assertFalse(restored.input().toString().contains("sha256"))
            val draft = JSONObject().put("schema_version", "1").put("groups", JSONArray())
                .put("excluded_spans", JSONArray()).put("review_items", JSONArray())
            val response = JSONObject().put("session_id", first.id).put("input_revision", first.revision)
                .put("model", "synthetic-contract-test").put("prompt_version", "test").put("draft", draft)
            val generated = restored.adopt(response)
            store.save(generated.copy(accepted = generated.revision))
            assertEquals(generated.revision, store.load(file).accepted)
            val changed = store.load(file).edit("아침에 김밥을 먹었어.", "보호자", first.recordedAt)
            assertEquals(-1, changed.confirmed); assertEquals(-1, changed.accepted)
            assertNotNull(changed.draft); assertNotEquals(changed.revision, changed.draftRevision)
            try { changed.confirm().adopt(response); fail("stale revision accepted") } catch (_: IllegalArgumentException) { }
            store.save(changed)
            assertEquals(first.rawHistory, store.load(file).rawHistory)
            assertEquals(sha, PcmWave.sha256(file))
            val other = fixture()
            try { assertEquals("", store.load(other).text) } finally { other.delete(); store.delete(other.name) }
        } finally { file.delete(); store.delete(file.name) }
    }
    @Test fun reviewScreenConfirmsAndPreservesTextOnUnconfiguredGeneration() {
        val file = fixture(); val store = store(); val sha = PcmWave.sha256(file)
        store.save(store.load(file).withSpeech("오늘 공원에서 쉬었어요.").edit("오늘 공원에서 쉬었어요.", "보호자", "2026-11-08T04:00:00Z"))
        var activity: MainActivity? = null
        fun ui(action: () -> Unit) = instrumentation.runOnMainSync(action)
        fun views(v: View): List<View> = listOf(v) + if (v is ViewGroup) (0 until v.childCount).flatMap { views(v.getChildAt(it)) } else emptyList()
        fun all() = views(activity!!.window.decorView)
        fun button(name: String) = all().filterIsInstance<Button>().first { it.text.toString() == name }
        fun editor(name: String) = all().filterIsInstance<EditText>().first { it.contentDescription == name }
        fun checks() = all().filterIsInstance<CheckBox>()
        fun launch() {
            activity = instrumentation.startActivitySync(Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
            instrumentation.waitForIdleSync()
            ui { checks().take(2).forEach { it.isChecked = true } }
            instrumentation.waitForIdleSync()
        }
        try {
            launch()
            ui {
                assertEquals("오늘 공원에서 쉬었어요.", editor("확인할 이야기").text.toString())
                assertFalse(button("일기 초안 만들기").isEnabled)
                editor("확인할 이야기").setText("오늘 공원 그늘에서 쉬었어요.")
                assertEquals("2026-11-08 13:00", editor("녹음 시각 확인").text.toString())
                button("선택한 원본 듣기").performClick()
                assertTrue(editor("확인할 이야기").isEnabled)
                button("녹음 마침 / 재생 중지").performClick()
                button("확인문 저장").performClick()
                checks().last().isChecked = true
                assertTrue(button("일기 초안 만들기").isEnabled)
                button("일기 초안 만들기").performClick()
            }
            val until = System.currentTimeMillis() + 15000
            var observed = false
            while (System.currentTimeMillis() < until && !observed) {
                ui { observed = all().filterIsInstance<TextView>().any { it.text.contains("API 키·모델이 아직 설정되지") } }
                if (!observed) Thread.sleep(100)
            }
            assertTrue("Expected local server NOT_CONFIGURED; requires pnpm probe:server without provider credentials and connect-diary-probe.sh", observed)
            ui {
                val scroll = all().filterIsInstance<ScrollView>().single()
                val panel = editor("확인할 이야기").parent as View
                scroll.scrollTo(0, panel.top)
            }
            instrumentation.waitForIdleSync()
            instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
                File(instrumentation.targetContext.filesDir, "synthetic-review-screen.png").outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }; bitmap.recycle()
            }
            ui {
                assertEquals("오늘 공원 그늘에서 쉬었어요.", editor("확인할 이야기").text.toString())
                assertFalse(button("검토한 일기 이 기기에 저장").isEnabled)
                checks().first().isChecked = false
                assertEquals(View.GONE, editor("확인할 이야기").parent.let { it as View }.visibility)
                checks().first().isChecked = true
                assertTrue(button("일기 초안 만들기").isEnabled) // No auto retry.
                activity!!.finish()
            }
            instrumentation.waitForIdleSync(); launch()
            ui { assertEquals("오늘 공원 그늘에서 쉬었어요.", editor("확인할 이야기").text.toString()) }
            assertEquals(sha, PcmWave.sha256(file))
            assertEquals("오늘 공원에서 쉬었어요.", store.load(file).rawHistory.single())
        } finally { ui { activity?.finish() }; file.delete(); store.delete(file.name) }
    }
}
