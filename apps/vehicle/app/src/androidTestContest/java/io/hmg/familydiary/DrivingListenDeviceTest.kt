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

/** C047: cache-only synthetic diaries; never a discoverable or uploaded family recording. */
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
   val prefix="c047-${UUID.randomUUID()}"
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
   ui{recording.setSimulation(Motion.PARKED);(get("consent") as CheckBox).isChecked=true;(get("parked") as CheckBox).isChecked=true;field("drivingDiaryRows").set(a,files.reversed());select.invoke(a,files[20])}
   var result=JSONObject();ui{result=page.invoke(a,JSONObject()) as JSONObject}
   assertEquals(17,result.getJSONArray("items").length());assertEquals(files[28].name,result.getJSONArray("items").getJSONObject(0).getString("id"))
   assertFalse(result.toString().contains("statements"));assertFalse(result.toString().contains("snapshot"))
   val version=result.getInt("version")
   ui{result=page.invoke(a,JSONObject().put("direction","after").put("cursor",files[12].name).put("version",version)) as JSONObject}
   assertEquals(8,result.getJSONArray("items").length());assertEquals(files[11].name,result.getJSONArray("items").getJSONObject(0).getString("id"))
   ui{result=page.invoke(a,JSONObject().put("direction","before").put("cursor","removed.wav").put("version",version)) as JSONObject}
   assertTrue(result.getBoolean("reset"));assertEquals(17,result.getJSONArray("items").length())
   // Renaming keeps audio/text/source evidence, promotes revision atomically, and persists.
   val original=store.load(files[20]);val renamed=original.renameTitle("합성 가족의 새 제목")
   assertEquals(original.revision+1,renamed.revision);assertEquals(renamed.revision,renamed.accepted);assertEquals(renamed.revision,renamed.confirmed);assertEquals(renamed.revision,renamed.draftRevision)
   assertEquals(original.text,renamed.text);assertEquals(original.rawHistory,renamed.rawHistory);assertEquals(original.sha256,renamed.sha256);assertEquals(original.speechTimeline,renamed.speechTimeline)
   assertEquals(original.draft?.let{JSONObject(it).getJSONArray("groups").getJSONObject(0).getJSONArray("statements").toString()},JSONObject(renamed.draft!!).getJSONArray("groups").getJSONObject(0).getJSONArray("statements").toString())
   store.save(renamed);assertEquals(renamed,store.load(files[20]));assertTrue(runCatching{renamed.renameTitle(" ")}.isFailure)
   // Keep ReviewPanel in step with the fixture edited by this test.
   ui{(get("review") as ReviewPanel).select(null);(get("review") as ReviewPanel).select(files[20],renamed)}
   assertFalse(service.autoAdvance)
   own=true;action("listenToggle")
   waitFor("second sentence actually speaking"){service.speaking&&service.sentenceIndex==1}
   action("listenToggle");waitFor("pause acknowledged"){service.narrationPaused&&!service.speaking&&!service.settling}
   val sentence=service.sentenceIndex;val elapsed=service.narrationElapsed
   Thread.sleep(250);assertEquals(sentence,service.sentenceIndex);assertEquals(elapsed,service.narrationElapsed,0.01)
   action("listenToggle");waitFor("same sentence resumes"){service.speaking&&service.sentenceIndex==sentence};assertEquals(files[20],service.file)
   action("listenOriginal");Thread.sleep(150)
   assertTrue(service.narrating);assertEquals(files[20],service.file);assertEquals("diary",get("activeListenMode"))
   action("listenSelect",files[20].name);waitFor("explicit same original after acknowledged stop"){service.player?.isPlaying==true};assertEquals(files[20],service.file)
   action("listenDiary");Thread.sleep(150);assertTrue(service.player?.isPlaying==true);assertEquals("original",get("activeListenMode"))
   action("listenToggle");waitFor("original paused"){service.prepared&&service.player?.isPlaying==false}
   action("listenNext");waitFor("paused next selected without auto play"){get("selected")==files[19]&&!service.busy}
   action("listenDiary");waitFor("paused mode change"){get("drivingListenMode")=="diary"&&!service.busy}
   action("listenSelect",files[20].name);waitFor("explicit selection starts TTS"){service.file==files[20]&&service.speaking}
   action("listenExit");waitFor("explicit stop acknowledged"){!service.busy&&!service.settling}
   Thread.sleep(300);assertFalse(service.speaking);assertFalse(service.narrationPaused)
   // Both media types stop at one item by default, and only advance when opted in.
   ui{service.playQueue(listOf(files[1],files[2]),0)}
   waitFor("single original completes"){!service.busy};assertEquals(files[1],service.file)
   ui{service.narrateQueue(listOf(PlaybackService.NarrationItem(files[1],"하나.","하나"),PlaybackService.NarrationItem(files[2],"둘.","둘")))}
   waitFor("single TTS completes"){!service.busy};assertEquals(files[1],service.file)
   action("listenAutoplay");assertTrue(service.autoAdvance)
   // Start at the last item: a normal completion must wrap to the first.
   ui{service.playQueue(listOf(files[20],files[1]),1)}
   waitFor("original last wraps to first"){service.file==files[20]&&service.player?.isPlaying==true}
   action("listenAutoplay");assertFalse(service.autoAdvance)
   ui{service.player!!.seekTo(service.player!!.duration-30)}
   waitFor("turning repeat off completes the current original"){!service.busy};assertEquals(files[20],service.file)
   action("listenAutoplay")
   ui{service.narrateQueue(listOf(PlaybackService.NarrationItem(files[1],"첫 번째 합성 일기를 듣고 있습니다.","하나"),PlaybackService.NarrationItem(files[2],"둘.","둘")),1)}
   waitFor("TTS last wraps to first"){service.file==files[1]&&service.speaking}
   action("listenAutoplay");assertFalse(service.autoAdvance)
   waitFor("turning repeat off completes the current TTS"){!service.busy};assertEquals(files[1],service.file)
   action("listenAutoplay")
   ui{service.playQueue(listOf(files[20]),0)}
   waitFor("single original starts"){service.player?.isPlaying==true}
   val firstPlayer=service.player
   ui{service.player!!.seekTo(service.player!!.duration-30)}
   waitFor("one-item original repeats"){service.player!=null&&service.player!==firstPlayer&&service.player?.isPlaying==true}
   action("listenExit");waitFor("stop prevents original repeat"){!service.busy}
   ui{service.narrateQueue(listOf(PlaybackService.NarrationItem(files[1],"합성 한 편을 반복합니다.","하나")))}
   waitFor("single TTS starts"){service.speaking}
   val generation=PlaybackService::class.java.getDeclaredField("generation").apply{isAccessible=true}
   val firstGeneration=generation.getInt(service)
   waitFor("one-item TTS starts another rendition"){service.speaking&&generation.getInt(service)>firstGeneration}
   action("listenExit");waitFor("stop acknowledgement prevents TTS repeat"){!service.busy&&!service.settling}
   Thread.sleep(300);assertFalse(service.busy)
   ui{recording.setSimulation(Motion.UNKNOWN)}
   assertFalse(service.busy)
   ui{recording.setSimulation(Motion.PARKED)}
  } finally {
   ui{if(own)(get("playbackService") as? PlaybackService)?.stop();a.finish()};i.waitForIdleSync()
   files.forEach{store.delete(it.name);it.delete()}
  }
 }
}
