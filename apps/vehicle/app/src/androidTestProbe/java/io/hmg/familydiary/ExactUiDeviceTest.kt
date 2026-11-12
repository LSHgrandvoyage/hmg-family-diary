package io.hmg.familydiary

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** End-to-end bridge UI with a temporary synthetic record; no microphone or network upload. */
class ExactUiDeviceTest {
 @Test fun referenceDomReadsAndReplaysNativeOriginalAndHonorsGate(){
  val i=InstrumentationRegistry.getInstrumentation();val root=i.targetContext.filesDir
  val file=File(File(root,"capture-probe").apply{mkdirs()},"synthetic-exact-${UUID.randomUUID()}.wav")
  file.writeBytes(PcmWave.header(32000*8L)+ByteArray(32000*8))
  val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
  val story="합성 디자인 검증. 차 안에서 함께 노래를 부르고 바다 이야기를 했어요."
  val r=store.load(file).withSpeech(story).edit(story,"합성 가족","2099-11-08T04:00:00Z").confirm()
  val draft=JSONObject().put("groups",JSONArray().put(JSONObject().put("id","g1").put("label","합성 가족의 바다 이야기").put("statements",JSONArray().put(JSONObject().put("text",story)))))
  store.save(r.copy(draft=draft.toString(),draftRevision=r.revision,accepted=r.revision,generationMode="mock"))
  contexts.create(file.name,MemoryContext(r.recordedAt,VehicleSnapshot("합성 차량",source="synthetic")))
  repeat(2){val bitmap=Bitmap.createBitmap(320,200,Bitmap.Config.ARGB_8888);bitmap.eraseColor(if(it==0)Color.rgb(221,227,245) else Color.rgb(243,225,214));val out=java.io.ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,out);bitmap.recycle();val added=contexts.addPhoto(file.name,out.toByteArray().inputStream());assertEquals(added,contexts.photos(file.name).first())}
  var a:MainActivity?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{views(v.getChildAt(it))}else emptyList()
  fun eval(js:String):String {val latch=CountDownLatch(1);var result="";ui {views(a!!.window.decorView).filterIsInstance<WebView>().first().evaluateJavascript(js){result=it;latch.countDown()}};assertTrue(latch.await(5,TimeUnit.SECONDS));return result}
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(100)};fail(label)}
  fun capture(name:String){i.waitForIdleSync();val bitmap=i.uiAutomation.takeScreenshot();bitmap?.let{File(root,name).outputStream().use{out->it.compress(Bitmap.CompressFormat.PNG,100,out)};it.recycle()}}
  try{
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   waitFor("recording service attached"){a!!.javaClass.getDeclaredField("recordingService").apply{isAccessible=true}.get(a!!)!=null}
   ui {a!!.javaClass.getDeclaredField("nextAutoPull").apply{isAccessible=true}.setLong(a,Long.MAX_VALUE);a!!.gateTestControls().take(2).forEach{it.isChecked=true}}
   waitFor("reference home visible"){eval("document.body.innerText.includes('오늘 가는 길의 이야기')")=="true"}
   assertEquals("false",eval("document.body.innerText.includes('이 기억과 함께 남는 것')"))
   capture("synthetic-exact-home.png")
   eval("window.openNativeMemory(${JSONObject.quote(file.name)})")
   waitFor("real native record in reference DOM"){eval("document.querySelector('h1')?.textContent").contains("합성 가족의 바다 이야기")}
   assertEquals("false",eval("document.body.innerText.includes('일기 읽기')"))
   waitFor("local photos loaded"){eval("[...document.images].length===2 && [...document.images].every(i=>i.complete&&i.naturalWidth>0)")=="true"}
   assertEquals("true",eval("document.querySelector('#app').getBoundingClientRect().right <= document.documentElement.clientWidth + 1"))
   assertEquals("false",eval("document.body.innerText.includes('기억에 남는 한마디')"))
   capture("synthetic-exact-detail.png")
   eval("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('녹음 원문 듣기')).click()")
   waitFor("native playback position advances"){eval("Number(document.querySelector('input[type=range]').value)>0.2")=="true"}
   assertEquals("true",eval("[...document.querySelectorAll('[data-wave-bar]')].some(b=>Number(b.dataset.played)>0)"))
   waitFor("completed original fully orange"){eval("document.querySelectorAll('[data-wave-bar][data-played=\"1.000\"]').length===32")=="true"}
   eval("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('녹음 원문 듣기')).click()")
   waitFor("replay starts from beginning"){eval("Number(document.querySelector('input[type=range]').value)>.2 && Number(document.querySelector('input[type=range]').value)<4")=="true"}
   ui {a!!.gateTestControls().first().isChecked=false}
   var hidden=false;ui {hidden=views(a!!.window.decorView).filterIsInstance<WebView>().first().visibility==View.GONE};assertTrue(hidden)
   // JS requests cannot bypass the native parked gate after the screen is hidden.
   eval("window.__gateResult='';window.__originalReply=window.NativeReply;window.NativeReply=(id,r)=>window.__gateResult=r.error||'unexpected';NativeDiary.invoke(JSON.stringify({id:999,cmd:'play',memoryId:${JSONObject.quote(file.name)}}))")
   waitFor("native gate rejects hidden bridge playback"){eval("window.__gateResult.includes('주차')")=="true"}
   eval("window.NativeReply=window.__originalReply")
   ui {a!!.gateTestControls().first().isChecked=true}
   eval("location.hash='carlist'")
   waitFor("diary options in native list"){eval("!!document.querySelector('[aria-label=\"합성 가족의 바다 이야기 옵션\"]')")=="true"}
   assertEquals("false",eval("document.body.innerText.includes('오늘의 일기 녹음하기')"))
   eval("document.querySelector('[aria-label=\"합성 가족의 바다 이야기 옵션\"]').click()")
   eval("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='일기 삭제').click()")
   eval("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='취소').click()")
   assertTrue(file.exists())
   eval("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='일기 삭제').click()")
   eval("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='삭제').click()")
   waitFor("native original deleted after confirmation"){!file.exists()}
   waitFor("removed record absent from list"){eval("!document.querySelector('[aria-label=\"합성 가족의 바다 이야기 옵션\"]')")=="true"}

  }finally{ui{a?.finish()};contexts.delete(file.name);store.delete(file.name);file.delete()}
 }
}
