package io.hmg.familydiary

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Synthetic transcript -> real local mock server -> native persisted diary, no microphone. */
class DiaryFlowDeviceTest {
 @Test fun reviewCreatePreviewSaveAndReopenEntirelyInVehicle() {
  val ins=InstrumentationRegistry.getInstrumentation();val root=ins.targetContext.filesDir
  val file=File(File(root,"capture-probe").apply{mkdirs()},"synthetic-flow-${UUID.randomUUID()}.wav")
  file.writeBytes(PcmWave.header(32000*2L)+ByteArray(32000*2));val hash=PcmWave.sha256(file)
  val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
  store.save(store.load(file).copy(recordedAt="2099-11-08T04:00:00Z").withSpeech("합성 이야기. 바다에 갔어요."))
  var activity:MainActivity?=null
  fun ui(fn:()->Unit)=ins.runOnMainSync(fn)
  fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{views(v.getChildAt(it))}else emptyList()
  fun eval(js:String):String {val latch=CountDownLatch(1);var result="";ui{views(activity!!.window.decorView).filterIsInstance<WebView>().first().evaluateJavascript(js){result=it;latch.countDown()}};assertTrue(latch.await(5,TimeUnit.SECONDS));return result}
  fun waitFor(label:String,test:()->Boolean){val until=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<until){if(test())return;Thread.sleep(100)};fail(label)}
  try {
   activity=ins.startActivitySync(Intent(ins.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   ui{views(activity!!.window.decorView).filterIsInstance<CheckBox>().take(2).forEach{it.isChecked=true}}
   waitFor("web bridge ready"){eval("typeof window.openNativeReview==='function'")=="true"}
   eval("window.openNativeReview(${JSONObject.quote(file.name)})")
   waitFor("review with recognized words"){eval("document.querySelector('[data-review-text]')?.value").contains("바다에 갔어요")}
   val correction="합성 이야기. 바다가 아니라 공원에 갔어요."
   eval("document.querySelector('[data-review-text]').value=${JSONObject.quote(correction)};document.querySelector('[data-review-text]').dispatchEvent(new Event('input'));document.querySelector('[data-create]').click()")
   waitFor("local mock draft ready"){eval("document.querySelector('[data-save]')?.hidden===false")=="true"}
   assertEquals(correction,store.load(file).text)
   assertEquals(-1,store.load(file).accepted)
   assertEquals("mock",store.load(file).generationMode)
   eval("document.querySelector('[data-save]').click()")
   waitFor("saved and returned to diary"){eval("location.hash.startsWith('#cardetail')")=="true"}
   val saved=store.load(file);assertEquals(saved.revision,saved.accepted);assertEquals(hash,PcmWave.sha256(file))
   eval("window.openNativeMemory(${JSONObject.quote(file.name)})")
   waitFor("saved diary reopened"){eval("document.body.innerText.replace(/\\s/g,'')").contains(correction.replace(" ",""))}
   assertEquals("false",eval("document.body.innerText.includes('확인문 저장')"))
  } finally {ui{activity?.finish()};contexts.delete(file.name);store.delete(file.name);file.delete()}
 }
}
