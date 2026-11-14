package io.hmg.familydiary

import android.app.AlertDialog
import android.content.Intent
import android.webkit.WebView
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.lang.reflect.InvocationTargetException
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** C050: cache-only fixture; retain existing server address, CA and pairing. */
class InteractionDeviceTest {
 @Test fun settingsResumeAndPlaybackGuards() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
  val a=i.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(name:String)=MainActivity::class.java.getDeclaredField(name).apply{isAccessible=true}
  fun get(name:String)=field(name).get(a)
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<end){var ok=false;ui{ok=test()};if(ok)return;Thread.sleep(50)};var flags="";ui{flags=" sync="+get("syncBusy")+" speech="+(get("recordingService") as RecordingService).speech.busy+" review="+(get("review") as ReviewPanel).busy+" motion="+get("signalMotion")+" consent="+(get("consent") as CheckBox).isChecked};fail(label+flags)}
  fun eval(web:WebView,js:String):String {val done=CountDownLatch(1);var result="";ui{web.evaluateJavascript(js){result=it;done.countDown()}};assertTrue(done.await(5,TimeUnit.SECONDS));return result}
  fun waitJs(web:WebView,label:String,js:String){val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(eval(web,js)=="true")return;Thread.sleep(60)};fail(label+" route="+eval(web,"location.hash.split('?')[0]")+" surfaces="+eval(web,"Array.from(document.querySelectorAll('[data-page]')).map(x=>[x.dataset.page,x.style.visibility])"))}
  val store=ReviewStore(File(ctx.filesDir,"capture-review"));var file:File?=null
  var service:RecordingService?=null;var oldResult:File?=null;var own=false;var injected=false
  val resultField=RecordingService::class.java.getDeclaredField("resultFile").apply{isAccessible=true}
  try {
   waitFor("services ready"){get("initialized")==true&&get("recordingService")!=null&&get("playbackService")!=null}
   service=get("recordingService") as RecordingService;val recording=service!!;val playback=get("playbackService") as PlaybackService
   assumeTrue("Never interrupt user media",!recording.capture.busy&&!recording.settling&&!playback.busy)
   oldResult=recording.resultFile
   val f=File(ctx.cacheDir,"c050-${UUID.randomUUID()}.wav").apply{writeBytes(PcmWave.header(1920000)+ByteArray(1920000))};file=f
   var record=store.load(f).edit("합성 이야기","합성 가족","2099-11-14T00:00:00Z").confirm()
   record=record.adopt(LocalDiaryMock.generate(record.input()));store.save(record.copy(accepted=record.revision))
   val select=MainActivity::class.java.getDeclaredMethod("selectReference",File::class.java).apply{isAccessible=true}
   val listen=MainActivity::class.java.getDeclaredMethod("drivingListen",String::class.java,String::class.java).apply{isAccessible=true}
   ui{recording.setSimulation(Motion.PARKED);(get("consent") as CheckBox).isChecked=true;(get("parked") as CheckBox).isChecked=true;select.invoke(a,f);field("drivingDiaryRows").set(a,listOf(f));resultField.set(recording,f);field("handledRecording").set(a,f);field("liveFile").set(a,f)}
   injected=true
   val resume=MainActivity::class.java.getDeclaredMethod("onResume").apply{isAccessible=true}
   val newIntent=MainActivity::class.java.getDeclaredMethod("onNewIntent",Intent::class.java).apply{isAccessible=true}
   val exact=get("exact") as WebView
   waitJs(exact,"web ready","typeof window.restoreNativeView==='function' && !!document.querySelector('[data-page]')")
   eval(exact,"window.restoreNativeView('carsettings',null)")
   waitJs(exact,"settings visible","document.querySelector('[data-page=carsettings]')?.style.visibility==='visible'")
   // Recreate configure-release's onNewIntent/onResume path with the same existing public config.
   val configured=ServerSettings.configured(ctx.filesDir)
   assertTrue("Existing local test server must be configured",configured)
   val settings=ServerSettings.read(ctx.filesDir)
   assertEquals(settings,ServerSettings.parse(settings.json().toString().toByteArray()))
   val canImport=MainActivity::class.java.getDeclaredMethod("canImportServerSettings").apply{isAccessible=true}
   waitFor("idle before server import"){canImport.invoke(a)==true}
   val encoded=android.util.Base64.encodeToString(settings.json().toString().toByteArray(),android.util.Base64.NO_WRAP)
   ui{newIntent.invoke(a,Intent(ctx,MainActivity::class.java).putExtra("chagok_server_config",encoded));resume.invoke(a)}
   waitFor("server confirmation shown"){(get("modal") as? AlertDialog)?.isShowing==true}
   waitJs(exact,"resume retains settings with old recording","document.querySelector('[data-page=carsettings]')?.style.visibility==='visible'")
   ui{(get("modal") as AlertDialog).getButton(AlertDialog.BUTTON_NEGATIVE).performClick()}
   waitJs(exact,"cancel retains settings","document.querySelector('[data-page=carsettings]')?.style.visibility==='visible'")
   ui{newIntent.invoke(a,Intent(ctx,MainActivity::class.java).putExtra("chagok_server_config",encoded));resume.invoke(a)}
   waitFor("confirmation again"){(get("modal") as? AlertDialog)?.isShowing==true}
   ui{(get("modal") as AlertDialog).getButton(AlertDialog.BUTTON_POSITIVE).performClick()}
   waitJs(exact,"apply retains settings","document.querySelector('[data-page=carsettings]')?.style.visibility==='visible'")
   assertEquals(settings,ServerSettings.read(ctx.filesDir))
   val summary=MainActivity::class.java.getDeclaredMethod("drivingSummary",File::class.java).apply{isAccessible=true}
   var date=JSONObject();ui{date=summary.invoke(a,f) as JSONObject}
   assertEquals("2099",date.getString("year"));assertEquals("11.14",date.getString("month_day"));assertTrue(date.getString("date").startsWith("2099년"))
   own=true;ui{playback.setSimulation(Motion.PARKED);playback.play(f)}
   waitFor("real original plays"){playback.player?.isPlaying==true}
   var reason:String?=null
   ui{field("syncBusy").setBoolean(a,true);try{listen.invoke(a,"listenNext","")}catch(e:InvocationTargetException){reason=e.cause?.message}}
   assertEquals("기록을 동기화하고 있어요. 잠시 후 재생해 주세요.",reason)
   ui{listen.invoke(a,"listenExit","")}
   waitFor("exit works despite sync guard"){!playback.busy}
   ui{field("syncBusy").setBoolean(a,false)}
   // A genuinely new completed result still opens review, unlike an ordinary resume.
   ui{field("handledRecording").set(a,null);resume.invoke(a)}
   waitJs(exact,"new recording still opens review","document.querySelector('[data-page=carreview]')?.style.visibility==='visible'")
  } finally {
   ui{field("syncBusy").setBoolean(a,false);if(own)(get("playbackService") as? PlaybackService)?.stop();if(injected)service?.let{resultField.set(it,oldResult)};a.finish()};i.waitForIdleSync()
   file?.let{store.delete(it.name);it.delete()}
  }
 }
}
