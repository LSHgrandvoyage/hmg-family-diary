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
   val f=File(ctx.cacheDir,"c052-${UUID.randomUUID()}.wav").apply{writeBytes(PcmWave.header(32000)+ByteArray(32000))};fixture=f
   val words="첫 번째 합성 문장은 가족이 여행을 떠난 이야기입니다. 두 번째 합성 문장에는 바다가 보입니다. 세 번째 문장에는 아이들의 웃음이 있습니다. 네 번째 문장의 중간에서 잠시 멈추고 같은 문장부터 다시 읽는 흐름을 확인합니다. 다섯 번째 문장은 오래 기억할 이야기입니다. 여섯 번째 문장은 집으로 돌아오는 길입니다. 일곱 번째 마지막 문장을 끝까지 읽었습니다."
   var r=store.load(f).edit(words,"합성 가족","2099-11-14T00:00:00Z").confirm()
   val draft=LocalDiaryMock.generate(r.input());draft.getJSONObject("draft").getJSONArray("groups").getJSONObject(0).getJSONArray("statements").getJSONObject(0).put("text",words)
   r=r.adopt(draft);store.save(r.copy(accepted=r.revision))
   val select=MainActivity::class.java.getDeclaredMethod("selectReference",File::class.java).apply{isAccessible=true}
   ui{recording.setSimulation(Motion.PARKED);(get("consent") as CheckBox).isChecked=true;(get("parked") as CheckBox).isChecked=true;select.invoke(a,f);field("drivingDiaryRows").set(a,listOf(f))}
   val web=get("exact") as WebView
   waitJs(web,"web ready","typeof window.restoreNativeView==='function'")
   eval(web,"window.restoreNativeView('carhome',null)")
   own=true;ui{playback.narrateQueue(listOf(PlaybackService.NarrationItem(f,words,"합성 진행 시험")));assertTrue(playback.narrationLines(f).isEmpty())}
   waitFor("speaking"){playback.speaking}
   waitJs(web,"parked clock ticks without MediaPlayer","(()=>{const t=document.querySelector('[data-player-time]')?.textContent;return !!t&&t!=='0:00'})()")
   ui{recording.setSimulation(Motion.DRIVING);field("drivingDiaryRows").set(a,listOf(f))}
   waitJs(web,"driving clock ticks","(()=>{const t=document.querySelector('[data-listen-position]')?.textContent;return !!t&&t!=='0:00'})()")
   waitFor("next sentence"){playback.speaking&&playback.sentenceIndex==3}
   ui{playback.toggleNarration()};waitFor("paused"){playback.narrationPaused&&!playback.settling}
   val elapsed=playback.narrationElapsed
   assertEquals(listOf(1,2,3,4,5),playback.narrationLines(f).map{it.index});assertEquals(3,playback.narrationLineIndex(f))
   val listenState=MainActivity::class.java.getDeclaredMethod("drivingListenState").apply{isAccessible=true}
   var state=JSONObject();ui{state=listenState.invoke(a) as JSONObject}
   assertEquals(5,state.getJSONArray("lyrics").length());assertEquals(3,state.getInt("lyrics_current"))
   waitJs(web,"actual current sentence window","document.querySelectorAll('[data-lyric-index]').length===5 && document.querySelector('[data-lyric-index=\"3\"]')?.getAttribute('aria-current')==='true' && document.querySelector('[data-listen-progress]')?.hidden===true")
   val clock=eval(web,"document.querySelector('[data-listen-position]').textContent")
   Thread.sleep(650);assertEquals(elapsed,playback.narrationElapsed,0.01);assertEquals(clock,eval(web,"document.querySelector('[data-listen-position]').textContent"))
   ui{playback.toggleNarration()};waitFor("resumed"){playback.speaking&&playback.sentenceIndex==3}
   waitFor("natural completion"){!playback.busy&&playback.narrationProgress(f)?.complete==true}
   val finished=playback.narrationProgress(f)!!;assertTrue(finished.elapsed>1);assertEquals(7,finished.total)
   assertEquals(listOf(4,5,6),playback.narrationLines(f).map{it.index})
   waitJs(web,"complete UI retains last sentence","document.querySelector('[data-listen-duration]')?.textContent==='낭독 완료' && document.querySelector('[data-listen-position]')?.textContent!=='0:00' && document.querySelector('[data-lyric-index=\"6\"]')?.getAttribute('aria-current')==='true'")
   ui{recording.setSimulation(Motion.PARKED)}
   for(route in listOf("carsettings","carlist","carhome")) {
    eval(web,"window.restoreNativeView('$route',null)")
    waitJs(web,"parked route ready","document.querySelector('[data-page=$route]')?.style.visibility==='visible'")
    assertEquals(finished,playback.narrationProgress(f))
   }
   ui{playback.stop()};assertNull(playback.narrationProgress(f));assertTrue(playback.narrationLines(f).isEmpty())
   ui{playback.narrateQueue(listOf(PlaybackService.NarrationItem(f,"합성 한 문장입니다.","한 문장")))}
   waitFor("single sentence completes"){!playback.busy&&playback.narrationProgress(f)?.complete==true}
   assertEquals(1,playback.narrationProgress(f)!!.total);assertEquals(listOf("합성 한 문장입니다."),playback.narrationLines(f).map{it.text})
  } finally {
   ui{if(own)(get("playbackService") as? PlaybackService)?.stop();a.finish()};i.waitForIdleSync()
   fixture?.let{store.delete(it.name);it.delete()}
  }
 }
}
