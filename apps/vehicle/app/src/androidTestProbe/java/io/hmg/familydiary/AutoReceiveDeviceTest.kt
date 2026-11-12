package io.hmg.familydiary

import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Isolated synthetic vault/directory. Tests MainActivity's real SSE subscription, not an explicit pull. */
class AutoReceiveDeviceTest {
 @Test fun foregroundTimerReceivesPhotosInServerOrderAndStopsAtGate() {
  val i=InstrumentationRegistry.getInstrumentation();val root=File(i.targetContext.filesDir,"auto-qa")
  // Previous test runs leave only synthetic files here; reset this fixture, never the app vault.
  listOf("capture-probe","capture-review","memory-context").forEach{File(root,it).deleteRecursively()}
  val recordings=File(root,"capture-probe").apply{mkdirs()};val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
  val fixture=JSONObject(File(root,"fixture.json").readText());val id=fixture.getString("id");val file=File(recordings,"$id.wav")
  val sync=CloudSync(root,recordings,store,contexts).apply{begin();pair(fixture.getString("code"),"자동 수신 합성 검사");pull()}
  var a:MainActivity?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun set(target:Any,name:String,value:Any){target.javaClass.getDeclaredField(name).apply{isAccessible=true}.set(target,value)}
  fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{views(v.getChildAt(it))}else emptyList()
  fun eval(js:String):String {val latch=CountDownLatch(1);var result="";ui{views(a!!.window.decorView).filterIsInstance<WebView>().first().evaluateJavascript(js){result=it;latch.countDown()}};assertTrue(latch.await(5,TimeUnit.SECONDS));return result}
  fun waitFor(label:String,test:()->Boolean){val until=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<until){if(test())return;Thread.sleep(100)};fail(label+" / "+listOf("syncNotice","syncPending","syncBusy","foreground","nativeEditor","referencePage","nextAutoPull").joinToString{key->key+"="+a!!.javaClass.getDeclaredField(key).apply{isAccessible=true}.get(a!!)}+" / events="+(a!!.javaClass.getDeclaredMethod("getSyncEvents").apply{isAccessible=true}.invoke(a!!) as SyncEvents).eventsReceived+" / synced="+sync.lastSyncedAt)}
  try {
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   waitFor("service connected"){a!!.javaClass.getDeclaredField("recordingService").apply{isAccessible=true}.get(a!!)!=null}
   ui {
    (a!!.javaClass.getDeclaredMethod("getSyncEvents").apply{isAccessible=true}.invoke(a!!) as SyncEvents).stop()
    set(a!!,"syncPending",true)
    set(a!!,"sync",sync);set(a!!,"directory",recordings);set(a!!,"store",store);set(a!!,"contexts",contexts)
    val review=a!!.javaClass.getDeclaredField("review").apply{isAccessible=true}.get(a!!);set(review,"store",store)
    a!!.gateTestControls().take(2).forEach{it.isChecked=true}
   }
   waitFor("home"){eval("!!document.querySelector('[data-page=carhome]')")=="true"}
   eval("window.openNativeMemory(${JSONObject.quote(file.name)})")
   waitFor("detail"){eval("!!document.querySelector('[data-page=cardetail] h1')")=="true"}
   File(root,"ready").writeText("ready") // Host adds two photos through authenticated HTTPS after this.
   waitFor("host uploaded"){File(root,"expected.json").exists()}
   val expected=JSONObject(File(root,"expected.json").readText()).getJSONArray("photos")
   waitFor("automatic receive"){contexts.photos(file.name).map{it.nameWithoutExtension}.take(2)==listOf(expected.getString(0),expected.getString(1))}
   waitFor("photo visible without share/refresh"){eval("document.querySelector('img')?.src.includes(${JSONObject.quote(expected.getString(0))})")=="true"}
   assertEquals("false",eval("document.body.innerText.includes('사진이 없어요')"))
   Thread.sleep(2500);val quiet=sync.lastVerifiedAt;Thread.sleep(6500)
   assertEquals("No periodic pull while connected and idle",quiet,sync.lastVerifiedAt)
   ui {a!!.gateTestControls().first().isChecked=false}
   Thread.sleep(1000);val stopped=sync.lastVerifiedAt;Thread.sleep(6000)
   assertEquals("No polling while parked gate is closed",stopped,sync.lastVerifiedAt)
  } finally {File(root,"ready").delete();ui{a?.finish()}}
 }
}
