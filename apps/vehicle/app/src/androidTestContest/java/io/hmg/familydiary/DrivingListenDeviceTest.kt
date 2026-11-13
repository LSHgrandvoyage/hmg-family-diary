package io.hmg.familydiary

import android.content.Intent
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

/** C045: cache-only synthetic diaries; never a discoverable or uploaded family recording. */
class DrivingListenDeviceTest {
 @Test fun pagesAndSentencePausePreserveSameMemory() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
  val a=i.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(name:String)=MainActivity::class.java.getDeclaredField(name).apply{isAccessible=true}
  fun get(name:String)=field(name).get(a)
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<end){var ok=false;ui{ok=test()};if(ok)return;Thread.sleep(50)};fail(label)}
  val store=ReviewStore(File(ctx.filesDir,"capture-review"));val files=mutableListOf<File>();var own=false
  try {
   waitFor("services"){get("initialized")==true&&get("recordingService")!=null&&get("playbackService")!=null}
   val service=get("playbackService") as PlaybackService;val recording=get("recordingService") as RecordingService
   assumeTrue("Never interrupt user's media",!service.busy&&!recording.capture.busy)
   val prefix="c045-${UUID.randomUUID()}"
   repeat(41){index->
    val bytes=if(index==20)1920000 else 3200
    val f=File(ctx.cacheDir,"$prefix-${index.toString().padStart(2,'0')}.wav").apply{writeBytes(PcmWave.header(bytes.toLong())+ByteArray(bytes))};files.add(f)
    var r=store.load(f).edit("합성 이야기 $index","합성 가족","2099-11-13T00:00:${index.toString().padStart(2,'0')}Z").confirm()
    val draft=LocalDiaryMock.generate(r.input())
    draft.getJSONObject("draft").getJSONArray("groups").getJSONObject(0).getJSONArray("statements").getJSONObject(0).put("text","첫 합성 문장입니다. "+"다음 합성 문장의 중간에서 일시정지를 확인합니다 ".repeat(3)+". 마지막 합성 문장입니다.")
    r=r.adopt(draft);store.save(r.copy(accepted=r.revision))
   }
   val select=MainActivity::class.java.getDeclaredMethod("selectReference",File::class.java).apply{isAccessible=true}
   val listen=MainActivity::class.java.getDeclaredMethod("drivingListen",String::class.java,String::class.java).apply{isAccessible=true}
   val page=MainActivity::class.java.getDeclaredMethod("listenPage",JSONObject::class.java).apply{isAccessible=true}
   fun action(name:String,id:String="")=ui{listen.invoke(a,name,id)}
   ui{recording.setSimulation(Motion.PARKED);(get("consent") as CheckBox).isChecked=true;(get("parked") as CheckBox).isChecked=true;field("drivingDiaryRows").set(a,files.toList());select.invoke(a,files[20])}
   var result=JSONObject();ui{result=page.invoke(a,JSONObject()) as JSONObject}
   assertEquals(17,result.getJSONArray("items").length());assertEquals(files[12].name,result.getJSONArray("items").getJSONObject(0).getString("id"))
   assertFalse(result.toString().contains("statements"));assertFalse(result.toString().contains("snapshot"))
   val version=result.getInt("version")
   ui{result=page.invoke(a,JSONObject().put("direction","after").put("cursor",files[28].name).put("version",version)) as JSONObject}
   assertEquals(8,result.getJSONArray("items").length());assertEquals(files[29].name,result.getJSONArray("items").getJSONObject(0).getString("id"))
   ui{result=page.invoke(a,JSONObject().put("direction","before").put("cursor","removed.wav").put("version",version)) as JSONObject}
   assertTrue(result.getBoolean("reset"));assertEquals(17,result.getJSONArray("items").length())
   own=true;action("listenToggle")
   waitFor("second sentence actually speaking"){service.speaking&&service.sentenceIndex==1}
   action("listenToggle");waitFor("pause acknowledged"){service.narrationPaused&&!service.speaking&&!service.settling}
   val sentence=service.sentenceIndex;val elapsed=service.narrationElapsed
   Thread.sleep(250);assertEquals(sentence,service.sentenceIndex);assertEquals(elapsed,service.narrationElapsed,0.01)
   action("listenToggle");waitFor("same sentence resumes"){service.speaking&&service.sentenceIndex==sentence};assertEquals(files[20],service.file)
   action("listenOriginal");waitFor("same original after acknowledged stop"){service.player?.isPlaying==true};assertEquals(files[20],service.file)
   action("listenToggle");waitFor("original paused"){service.prepared&&service.player?.isPlaying==false}
   action("listenNext");waitFor("paused next selected without auto play"){get("selected")==files[21]&&!service.busy}
   action("listenDiary");waitFor("paused mode change"){get("drivingListenMode")=="diary"&&!service.busy}
   action("listenSelect",files[20].name);waitFor("explicit selection starts TTS"){service.file==files[20]&&service.speaking}
   action("listenExit");waitFor("explicit stop acknowledged"){!service.busy&&!service.settling}
   Thread.sleep(300);assertFalse(service.speaking);assertFalse(service.narrationPaused)
   ui{recording.setSimulation(Motion.UNKNOWN)}
   assertFalse(service.busy)
   ui{recording.setSimulation(Motion.PARKED)}
  } finally {
   ui{if(own)(get("playbackService") as? PlaybackService)?.stop();a.finish()};i.waitForIdleSync()
   files.forEach{store.delete(it.name);it.delete()}
  }
 }
}
