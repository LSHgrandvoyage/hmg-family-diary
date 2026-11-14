package io.hmg.familydiary

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
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Actual Pleos TTS and WebView; cache-only synthetic diary, never uploaded. */
class NarrationProgressDeviceTest {
 @Test fun clockSentencesCompletionAndNavigation() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
  val a=i.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(name:String)=MainActivity::class.java.getDeclaredField(name).apply{isAccessible=true}
  fun get(name:String)=field(name).get(a)
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<end){var ok=false;ui{ok=test()};if(ok)return;Thread.sleep(50)};fail(label)}
  fun eval(web:WebView,js:String):String {val done=CountDownLatch(1);var result="";ui{web.evaluateJavascript(js){result=it;done.countDown()}};assertTrue(done.await(5,TimeUnit.SECONDS));return result}
  fun waitJs(web:WebView,label:String,js:String){val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(eval(web,js)=="true")return;Thread.sleep(60)};fail(label)}
  val store=ReviewStore(File(ctx.filesDir,"capture-review"));var fixture:File?=null;var own=false
  try {
   waitFor("services"){get("initialized")==true&&get("recordingService")!=null&&get("playbackService")!=null}
   val recording=get("recordingService") as RecordingService;val playback=get("playbackService") as PlaybackService
   assumeTrue("Never interrupt user media",!recording.capture.busy&&!recording.settling&&!playback.busy)
   val f=File(ctx.cacheDir,"c051-${UUID.randomUUID()}.wav").apply{writeBytes(PcmWave.header(32000)+ByteArray(32000))};fixture=f
   val words="오늘은 합성 가족과 함께 차 안에서 즐거웠던 여행 이야기를 나누었습니다. 다음 문장의 중간에서 잠시 멈추고 같은 문장부터 다시 읽는 흐름을 확인합니다. 마지막 문장을 끝까지 읽었습니다."
   var r=store.load(f).edit(words,"합성 가족","2099-11-14T00:00:00Z").confirm()
   val draft=LocalDiaryMock.generate(r.input());draft.getJSONObject("draft").getJSONArray("groups").getJSONObject(0).getJSONArray("statements").getJSONObject(0).put("text",words)
   r=r.adopt(draft);store.save(r.copy(accepted=r.revision))
   val select=MainActivity::class.java.getDeclaredMethod("selectReference",File::class.java).apply{isAccessible=true}
   ui{recording.setSimulation(Motion.PARKED);(get("consent") as CheckBox).isChecked=true;(get("parked") as CheckBox).isChecked=true;select.invoke(a,f);field("drivingDiaryRows").set(a,listOf(f))}
   val web=get("exact") as WebView
   waitJs(web,"web ready","typeof window.restoreNativeView==='function'")
   eval(web,"window.restoreNativeView('carhome',null)")
   own=true;ui{playback.narrateQueue(listOf(PlaybackService.NarrationItem(f,words,"합성 진행 시험")))}
   waitFor("speaking"){playback.speaking}
   waitJs(web,"parked clock ticks without MediaPlayer","(()=>{const t=document.querySelector('[data-player-time]')?.textContent;return !!t&&t!=='0:00'})()")
   ui{recording.setSimulation(Motion.DRIVING);field("drivingDiaryRows").set(a,listOf(f))}
   waitJs(web,"driving clock ticks","(()=>{const t=document.querySelector('[data-listen-position]')?.textContent;return !!t&&t!=='0:00'})()")
   waitFor("next sentence"){playback.speaking&&playback.sentenceIndex==1}
   ui{playback.toggleNarration()};waitFor("paused"){playback.narrationPaused&&!playback.settling}
   val elapsed=playback.narrationElapsed
   waitJs(web,"sentence progress","document.querySelector('[data-listen-progress]')?.getAttribute('aria-valuenow')==='1' && document.querySelector('[data-listen-progress]')?.getAttribute('aria-valuemax')==='3'")
   val clock=eval(web,"document.querySelector('[data-listen-position]').textContent")
   Thread.sleep(650);assertEquals(elapsed,playback.narrationElapsed,0.01);assertEquals(clock,eval(web,"document.querySelector('[data-listen-position]').textContent"))
   ui{playback.toggleNarration()};waitFor("resumed"){playback.speaking&&playback.sentenceIndex==1}
   waitFor("natural completion"){!playback.busy&&playback.narrationProgress(f)?.complete==true}
   val finished=playback.narrationProgress(f)!!;assertTrue(finished.elapsed>1);assertEquals(3,finished.total)
   waitJs(web,"complete UI retains clock and full progress","document.querySelector('[data-listen-duration]')?.textContent==='낭독 완료' && document.querySelector('[data-listen-position]')?.textContent!=='0:00' && document.querySelector('[data-listen-progress]')?.getAttribute('aria-valuenow')==='3'")
   ui{recording.setSimulation(Motion.PARKED)}
   for(route in listOf("carsettings","carlist","carhome")) {
    eval(web,"window.restoreNativeView('$route',null)")
    waitJs(web,"parked route ready","document.querySelector('[data-page=$route]')?.style.visibility==='visible'")
    assertEquals(finished,playback.narrationProgress(f))
   }
   ui{playback.stop()};assertNull(playback.narrationProgress(f))
   ui{playback.narrateQueue(listOf(PlaybackService.NarrationItem(f,"합성 한 문장입니다.","한 문장")))}
   waitFor("single sentence completes"){!playback.busy&&playback.narrationProgress(f)?.complete==true}
   assertEquals(1,playback.narrationProgress(f)!!.total)
  } finally {
   ui{if(own)(get("playbackService") as? PlaybackService)?.stop();a.finish()};i.waitForIdleSync()
   fixture?.let{store.delete(it.name);it.delete()}
  }
 }
}
