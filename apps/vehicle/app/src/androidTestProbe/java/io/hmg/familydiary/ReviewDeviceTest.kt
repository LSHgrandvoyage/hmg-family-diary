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
                .put("generation_mode", "mock").put("model", "synthetic-contract-test").put("prompt_version", "test").put("draft", draft)
            val generated = restored.adopt(response)
            store.save(generated.copy(accepted = generated.revision))
            assertEquals(generated.revision, store.load(file).accepted)
            assertEquals("mock", store.load(file).generationMode)
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
    @Test fun mockGenerationSavesReopensAndReplaysTheSameOriginal() {
        val file = fixture(); val store = store(); val sha = PcmWave.sha256(file)
        val story = "합성 UI 검증 이야기. 오늘 공원에서 쉬었어요. 어제 먹은 점심이 아니라 아침 이야기도 했어요."
        store.save(store.load(file).withSpeech(story).edit(story, "목업 보호자", "2026-11-08T04:00:00Z"))
        val context = io.hmg.familydiary.platform.MemoryContextStore(File(instrumentation.targetContext.filesDir, "memory-context"))
        context.create(file.name, io.hmg.familydiary.platform.MemoryContext("2026-11-08T04:00:00Z",
            io.hmg.familydiary.platform.VehicleSnapshot("우리의 첫 차", "현대", "아이오닉 5", "SUV", "2025", "샘플 00가0000", "synthetic"), true))
        var activity: MainActivity? = null
        var importedUri: android.net.Uri? = null
        fun ui(action: () -> Unit) = instrumentation.runOnMainSync(action)
        fun views(v: View): List<View> = listOf(v) + if (v is ViewGroup) (0 until v.childCount).flatMap { views(v.getChildAt(it)) } else emptyList()
        fun all() = views(activity!!.window.decorView)
        fun button(name: String) = all().filterIsInstance<Button>().first { it.text.toString() == name }
        fun editor(name: String) = all().filterIsInstance<EditText>().first { it.contentDescription == name }
        fun waitFor(message: String, condition: () -> Boolean) {
            val until = System.currentTimeMillis() + 15000; var found = false
            while (System.currentTimeMillis() < until && !found) { ui { found = condition() }; if (!found) Thread.sleep(100) }
            assertTrue(message, found)
        }
        fun screenshot(name: String) {
            instrumentation.waitForIdleSync(); instrumentation.uiAutomation.waitForIdle(500, 5000)
            instrumentation.uiAutomation.takeScreenshot()?.let { bitmap ->
                File(instrumentation.targetContext.filesDir, name).outputStream().use {
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
                }; bitmap.recycle()
            }
        }
        fun openFixture() {
            waitFor("Fixture row in library") { all().any { it.tag == "memory:${file.name}" } }
            ui { (all().first { it.tag == "memory:${file.name}" } as Button).performClick() }
            waitFor("Fixture detail loaded") { editor("확인할 이야기").text.toString() == story }
        }
        fun launch() {
            activity = instrumentation.startActivitySync(Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
            instrumentation.waitForIdleSync()
            ui { all().filterIsInstance<CheckBox>().take(2).forEach { it.isChecked = true } }
            waitFor("Library is visible") { button("새 이야기 녹음하기").isShown }
            ui { editor("날짜·이야기 검색").setText("합성 UI 검증 이야기") }
        }
        try {
            launch()
            waitFor("Filtered fixture") { all().any { it.tag == "memory:${file.name}" } }
            ui {
                assertEquals(1, all().count { it.tag?.toString()?.startsWith("memory:") == true })
                editor("날짜·이야기 검색").clearFocus()
            }
            screenshot("synthetic-vehicle-library.png")
            ui { button("새 이야기").performClick() }
            assertTrue("record screen", run { var visible = false; ui { visible = button("녹음 시작").isShown && button("녹음 시작").isEnabled }; visible })
            screenshot("synthetic-vehicle-record.png")
            ui { button("이야기 보관함").performClick() }; openFixture()
            ui {
                assertTrue(button("확인문 저장").isShown)
                assertFalse(button("일기 초안 만들기").isEnabled)
                button("확인문 저장").performClick()
                all().filterIsInstance<CheckBox>().first { it.text.contains("맥북의 목업 서버") }.isChecked = true
                button("일기 초안 만들기").performClick()
            }
            waitFor("Explicit mock generator result") { button("검토한 일기 이 기기에 저장").isEnabled }
            ui { button("검토한 일기 이 기기에 저장").performClick() }
            waitFor("Saved diary read view") { all().filterIsInstance<TextView>().any { it.isShown && it.text == "이 기기에 저장한 일기" } }
            val saved = store.load(file)
            assertEquals(saved.revision, saved.accepted); assertEquals("mock", saved.generationMode)
            val statement = JSONObject(saved.draft!!).getJSONArray("groups").getJSONObject(0).getJSONArray("statements").getJSONObject(0)
            assertEquals(story, statement.getString("text"))
            assertEquals("original", statement.getJSONArray("source_spans").getJSONObject(0).getString("utterance_id"))
            assertEquals(saved.durationMs, statement.getJSONArray("source_spans").getJSONObject(0).getLong("end_ms"))
            screenshot("synthetic-vehicle-diary.png")
            // Intercept the OS chooser only; the app imports a real, test-owned content URI.
            val resolver = instrumentation.targetContext.contentResolver
            val values = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, "synthetic-diary-${UUID.randomUUID()}.png")
                put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png")
                put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/DiaryTest")
            }
            importedUri = requireNotNull(resolver.insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values))
            val bitmap = android.graphics.Bitmap.createBitmap(320, 180, android.graphics.Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(android.graphics.Color.rgb(231, 244, 253))
            val canvas = android.graphics.Canvas(bitmap)
            val paint = android.graphics.Paint().apply { color = android.graphics.Color.rgb(10, 112, 194); textSize = 24f }
            canvas.drawText("SYNTHETIC PHOTO", 30f, 100f, paint)
            resolver.openOutputStream(importedUri!!).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it!!) }; bitmap.recycle()
            val monitor = instrumentation.addMonitor(android.content.IntentFilter(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); addDataType("image/*") },
                android.app.Instrumentation.ActivityResult(android.app.Activity.RESULT_OK, Intent().setData(importedUri)), true)
            try { ui { button("사진 추가").performClick() }; assertEquals("Chooser was intercepted", 1, monitor.hits) } finally { instrumentation.removeMonitor(monitor) }
            waitFor("Imported selected photo is visible") { all().filterIsInstance<Button>().any { it.text == "사진 크게 보기" } }
            assertEquals(1, context.photos(file.name).size)
            ui { all().filterIsInstance<CheckBox>().first().isChecked = true }
            waitFor("Return from chooser requires parked confirmation") { button("사진 크게 보기").isShown }
            ui { button("사진 크게 보기").requestRectangleOnScreen(android.graphics.Rect(0, 0, 100, 64), false) }
            screenshot("synthetic-vehicle-context-photo.png")
            ui { button("사진 크게 보기").performClick() }
            instrumentation.waitForIdleSync(); instrumentation.uiAutomation.waitForIdle(500, 5000)
            screenshot("synthetic-vehicle-photo-overlay.png")
            assertTrue("Photo overlay close action", instrumentation.uiAutomation.rootInActiveWindow.findAccessibilityNodeInfosByText("닫기").isNotEmpty())
            // Parking loss closes the photo overlay and locks the underlying reading UI.
            ui { all().filterIsInstance<CheckBox>().first().isChecked = false }
            instrumentation.waitForIdleSync(); instrumentation.uiAutomation.waitForIdle(500, 5000)
            assertTrue(instrumentation.uiAutomation.rootInActiveWindow.findAccessibilityNodeInfosByText("닫기").isEmpty())
            ui { all().filterIsInstance<CheckBox>().first().isChecked = true }
            ui { activity!!.finish() }; instrumentation.waitForIdleSync(); launch(); openFixture()
            waitFor("Attached photo survives activity restart") { all().filterIsInstance<Button>().any { it.text == "사진 크게 보기" } }
            ui {
                assertTrue(all().filterIsInstance<TextView>().any { it.isShown && it.text == "목업 · AI 정리 전" })
                button("원래 이야기").performClick(); button("원본 재생").performClick()
            }
            waitFor("MediaPlayer started") { all().filterIsInstance<Button>().any { it.text == "일시정지" && it.isEnabled } && all().filterIsInstance<TextView>().any { it.text.contains("보관한 원본 재생 중") } }
            ui { button("일시정지").performClick() }
            waitFor("Paused") { all().filterIsInstance<Button>().any { it.text == "이어서 듣기" } }
            ui {
                val bar = all().filterIsInstance<SeekBar>().single()
                assertEquals(8000, bar.max)
                // Invoke the same public interaction via accessibility progress action.
                val args = android.os.Bundle().apply { putFloat(android.view.accessibility.AccessibilityNodeInfo.ACTION_ARGUMENT_PROGRESS_VALUE, 4000f) }
                assertTrue(bar.performAccessibilityAction(android.view.accessibility.AccessibilityNodeInfo.AccessibilityAction.ACTION_SET_PROGRESS.id, args))
                button("이어서 듣기").performClick()
            }
            waitFor("Seek remains on same original") { all().filterIsInstance<TextView>().any { it.text.toString().startsWith("00:04 / ") || it.text.toString().startsWith("00:05 / ") } }
            ui { button("일시정지").performClick() }
            screenshot("synthetic-vehicle-original.png")
            ui { all().filterIsInstance<CheckBox>().first().isChecked = false }
            ui {
                assertFalse(button("원본 재생").isEnabled)
                assertFalse(button("원래 이야기").isShown)
                all().filterIsInstance<CheckBox>().first().isChecked = true
                assertEquals("원본 재생", button("원본 재생").text.toString()) // No automatic resume.
                button("내용 확인").performClick(); editor("확인할 이야기").setText("수정한 확인문")
                assertFalse(button("검토한 일기 이 기기에 저장").isEnabled); button("확인문 저장").performClick()
            }
            val edited = store.load(file)
            assertEquals(-1, edited.accepted); assertNotEquals(edited.revision, edited.draftRevision)
            assertEquals(listOf(story), edited.rawHistory); assertEquals(sha, PcmWave.sha256(file))
            ui { button("이 이야기 삭제").performClick() }
            instrumentation.waitForIdleSync(); instrumentation.uiAutomation.waitForIdle(500, 5000)
            val deleteAction = instrumentation.uiAutomation.rootInActiveWindow.findAccessibilityNodeInfosByText("삭제")
                .first { it.className.toString() == "android.widget.Button" }
            assertTrue(deleteAction.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK))
            waitFor("Deleted story returns to library") { button("새 이야기 녹음하기").isShown && all().none { it.tag == "memory:${file.name}" } }
            assertFalse(file.exists())
            assertFalse(File(instrumentation.targetContext.filesDir, "capture-review/${file.name}.json").exists())
            assertNull(context.load(file.name)); assertTrue(context.photos(file.name).isEmpty())
        } finally { ui { activity?.finish() }; importedUri?.let { instrumentation.targetContext.contentResolver.delete(it, null, null) }; file.delete(); store.delete(file.name); context.delete(file.name) }
    }
    @Test fun contextAndPhotosStayWithOriginalAcrossReloads() {
        val file = fixture(); val other = fixture()
        val root = File(instrumentation.targetContext.cacheDir, "synthetic-context-${UUID.randomUUID()}")
        val store = io.hmg.familydiary.platform.MemoryContextStore(root)
        val snapshot = io.hmg.familydiary.platform.MemoryContext("2026-11-08T04:00:00Z",
            io.hmg.familydiary.platform.VehicleSnapshot("그때의 차", "현대", "아반떼", "세단", "2015", "샘플", "synthetic"), true)
        try {
            store.create(file.name, snapshot)
            try { store.create(file.name, snapshot.copy(vehicle = snapshot.vehicle.copy(model = "바뀐 차"))); fail("rewrote snapshot") } catch (_: IllegalStateException) { }
            assertEquals(snapshot, store.load(file.name)); assertNull(store.load(other.name))
            val rotatedSource = File(root, "rotation-test.jpg")
            val sourceBitmap = android.graphics.Bitmap.createBitmap(32, 16, android.graphics.Bitmap.Config.ARGB_8888)
            rotatedSource.outputStream().use { sourceBitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, it) }; sourceBitmap.recycle()
            android.media.ExifInterface(rotatedSource.path).apply {
                setAttribute(android.media.ExifInterface.TAG_ORIENTATION, "6")
                setAttribute(android.media.ExifInterface.TAG_GPS_LATITUDE, "37/1,0/1,0/1")
                setAttribute(android.media.ExifInterface.TAG_GPS_LATITUDE_REF, "N"); saveAttributes()
            }
            val rotatedPhoto = store.addPhoto(other.name, rotatedSource.inputStream())
            val decoded = android.graphics.BitmapFactory.decodeFile(rotatedPhoto.path)
            assertEquals(16, decoded.width); assertEquals(32, decoded.height); decoded.recycle()
            assertNull(android.media.ExifInterface(rotatedPhoto.path).getAttribute(android.media.ExifInterface.TAG_GPS_LATITUDE))
            assertTrue(store.deletePhoto(other.name, rotatedPhoto))
            val bitmap = android.graphics.Bitmap.createBitmap(32, 32, android.graphics.Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(android.graphics.Color.BLUE)
            val out = java.io.ByteArrayOutputStream(); bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out); bitmap.recycle()
            val photo = store.addPhoto(file.name, out.toByteArray().inputStream())
            assertEquals(1, store.photos(file.name).size); assertTrue(store.photos(other.name).isEmpty())
            assertNotNull(android.graphics.BitmapFactory.decodeFile(photo.path))
            try { store.addPhoto(file.name, "not an image".byteInputStream()); fail("invalid image") } catch (_: IllegalArgumentException) { }
            try { store.addPhoto(file.name, ByteArray(10 * 1024 * 1024 + 1).inputStream()); fail("oversized image") } catch (_: IllegalArgumentException) { }
            repeat(7) { store.addPhoto(file.name, out.toByteArray().inputStream()) }
            try { store.addPhoto(file.name, out.toByteArray().inputStream()); fail("ninth photo") } catch (_: IllegalArgumentException) { }
            val reopened = io.hmg.familydiary.platform.MemoryContextStore(root)
            assertEquals(snapshot, reopened.load(file.name)); assertEquals(8, reopened.photos(file.name).size)
            assertTrue(reopened.deletePhoto(file.name, photo)); assertEquals(7, reopened.photos(file.name).size)
            try { reopened.deletePhoto(other.name, reopened.photos(file.name).first()); fail("cross record delete") } catch (_: IllegalArgumentException) { }
            assertTrue(reopened.delete(file.name)); assertNull(reopened.load(file.name)); assertTrue(reopened.photos(file.name).isEmpty())
        } finally { file.delete(); other.delete(); root.deleteRecursively() }
    }
    @Test fun originalSpeechIsTranscribedIntoTheIntegratedReview() {
        val directory = File(instrumentation.targetContext.filesDir, "capture-probe").apply { mkdirs() }
        val file = File(directory, "synthetic-ui-stt-${UUID.randomUUID()}.wav")
        file.writeBytes(instrumentation.context.assets.open("synthetic-stt.wav").use { it.readBytes() })
        val sha = PcmWave.sha256(file)
        var activity: MainActivity? = null
        fun ui(action: () -> Unit) = instrumentation.runOnMainSync(action)
        fun views(v: View): List<View> = listOf(v) + if (v is ViewGroup) (0 until v.childCount).flatMap { views(v.getChildAt(it)) } else emptyList()
        fun all() = views(activity!!.window.decorView)
        fun waitFor(condition: () -> Boolean) {
            var ready = false; val until = System.currentTimeMillis() + 45000
            while (!ready && System.currentTimeMillis() < until) { ui { ready = condition() }; if (!ready) Thread.sleep(100) }
            assertTrue("Saved synthetic PCM should reach the integrated review", ready)
        }
        try {
            activity = instrumentation.startActivitySync(Intent(instrumentation.targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
            instrumentation.waitForIdleSync()
            ui { all().filterIsInstance<CheckBox>().take(2).forEach { it.isChecked = true } }
            waitFor { all().any { it.tag == "memory:${file.name}" } }
            ui { (all().first { it.tag == "memory:${file.name}" } as Button).performClick() }
            waitFor { all().filterIsInstance<Button>().any { it.text == "음성을 글로 옮기기" && it.isShown && it.isEnabled } }
            ui { all().filterIsInstance<Button>().first { it.text == "음성을 글로 옮기기" }.performClick() }
            val expected = "오늘 가족과 바다에 갔어요 아이는 파도가 무서웠고 저는 바다가 좋았어요"
            fun normalize(value: String) = value.filter { it.isLetterOrDigit() }
            waitFor { all().filterIsInstance<EditText>().any { it.contentDescription == "확인할 이야기" && normalize(it.text.toString()) == normalize(expected) } }
            assertEquals(normalize(expected), normalize(store().load(file).rawHistory.single()))
            assertEquals(sha, PcmWave.sha256(file))
        } finally { ui { activity?.finish() }; file.delete(); store().delete(file.name) }
    }

}
