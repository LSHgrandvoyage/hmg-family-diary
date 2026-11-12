package io.hmg.familydiary

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.*
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

/** Synthetic local photos only: never shares, edits or exports existing user memories. */
class PhotoGalleryDeviceTest {
    @Test fun fourThumbnailsMoreZoomAndConfirmedDelete() {
        val i = InstrumentationRegistry.getInstrumentation()
        val root = i.targetContext.filesDir
        val recording = File(File(root, "capture-probe").apply { mkdirs() }, "synthetic-gallery-${UUID.randomUUID()}.wav")
        recording.writeBytes(PcmWave.header(32000) + ByteArray(32000))
        val store = ReviewStore(File(root, "capture-review"))
        val contexts = MemoryContextStore(File(root, "memory-context"))
        val story = "합성 사진 격자 검증 이야기"
        store.save(store.load(recording).withSpeech(story).edit(story, "합성 화자", "2026-11-10T04:00:00Z"))
        contexts.create(recording.name, MemoryContext("2026-11-10T04:00:00Z", VehicleSnapshot("합성 시험 차량", source = "synthetic")))
        repeat(5) { n ->
            val bitmap = Bitmap.createBitmap(if (n % 2 == 0) 240 else 480, if (n % 2 == 0) 480 else 240, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.rgb(190 + n * 10, 210, 240))
            val canvas = android.graphics.Canvas(bitmap)
            val paint = android.graphics.Paint().apply { color = Color.rgb(10, 70, 130); textSize = 24f; style = android.graphics.Paint.Style.STROKE; strokeWidth = 8f }
            canvas.drawRect(5f, 5f, bitmap.width - 5f, bitmap.height - 5f, paint)
            paint.style = android.graphics.Paint.Style.FILL
            canvas.drawText("PHOTO ${n + 1}", 24f, 100f, paint)
            val bytes = java.io.ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes); bitmap.recycle()
            contexts.addPhoto(recording.name, bytes.toByteArray().inputStream())
        }
        var activity: MainActivity? = null
        fun ui(action: () -> Unit) = i.runOnMainSync(action)
        fun views(v: View): List<View> = listOf(v) + if (v is ViewGroup) (0 until v.childCount).flatMap { views(v.getChildAt(it)) } else emptyList()
        fun all() = views(activity!!.window.decorView)
        fun button(text: String) = all().filterIsInstance<Button>().first { it.text.toString() == text }
        fun waitFor(message: String, condition: () -> Boolean) {
            val until = System.currentTimeMillis() + 10000; var ok = false
            while (System.currentTimeMillis() < until && !ok) { ui { ok = condition() }; if (!ok) Thread.sleep(100) }
            assertTrue(message, ok)
        }
        fun nodes(n: AccessibilityNodeInfo?): List<AccessibilityNodeInfo> = if (n == null) emptyList() else listOf(n) + (0 until n.childCount).flatMap { nodes(n.getChild(it)) }
        fun dialogClick(text: String) {
            i.waitForIdleSync()
            val node = nodes(i.uiAutomation.rootInActiveWindow).first { it.text?.toString() == text && it.isClickable }
            assertTrue(node.performAction(AccessibilityNodeInfo.ACTION_CLICK)); i.waitForIdleSync()
        }
        fun screenshot(name: String) {
            i.waitForIdleSync(); i.uiAutomation.waitForIdle(300, 3000)
            i.uiAutomation.takeScreenshot()?.let { b -> File(root, name).outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }; b.recycle() }
        }
        try {
            activity = i.startActivitySync(Intent(i.targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
            ui { activity!!.gateTestControls().take(2).forEach { it.isChecked = true }; all().filterIsInstance<EditText>().first { it.contentDescription == "날짜·이야기 검색" }.setText(story) }
            waitFor("synthetic memory") { all().any { it.tag == "memory:${recording.name}" } }
            ui { all().first { it.tag == "memory:${recording.name}" }.performClick() }
            waitFor("detail") { button("일기 읽기").isShown }
            ui { button("일기 읽기").performClick() }
            waitFor("4 previews") { all().count { it.tag?.toString()?.startsWith("photo:") == true } == 4 }
            ui {
                assertFalse(all().filterIsInstance<Button>().any { it.text == "사진 크게 보기" || it.text == "사진 삭제" })
                all().filterIsInstance<ImageView>().filter { it.tag?.toString()?.startsWith("photo:") == true }.forEach { assertEquals(ImageView.ScaleType.FIT_CENTER, it.scaleType) }
                button("사진 더보기 · 전체 5장").requestRectangleOnScreen(android.graphics.Rect(0, 0, 1, 1), true)
            }
            screenshot("synthetic-gallery-preview.png")
            ui { button("사진 더보기 · 전체 5장").performClick() }
            i.waitForIdleSync()
            assertTrue(nodes(i.uiAutomation.rootInActiveWindow).any { it.contentDescription?.toString() == "사진 5 크게 보기" })
            screenshot("synthetic-gallery-all.png")
            val photo = nodes(i.uiAutomation.rootInActiveWindow).first { it.contentDescription?.toString() == "사진 1 크게 보기" }
            assertTrue(photo.performAction(AccessibilityNodeInfo.ACTION_CLICK)); i.waitForIdleSync()
            screenshot("synthetic-gallery-expanded.png")
            dialogClick("사진 삭제"); dialogClick("취소")
            assertEquals(5, contexts.photos(recording.name).size)
            dialogClick("사진 삭제"); dialogClick("삭제")
            waitFor("deleted and more hidden at four") { contexts.photos(recording.name).size == 4 && all().filterIsInstance<Button>().none { it.text.toString().startsWith("사진 더보기") } && all().count { it.tag?.toString()?.startsWith("photo:") == true } == 4 }
        } finally {
            ui { activity?.finish() }; contexts.delete(recording.name); store.delete(recording.name); recording.delete()
        }
    }
}
