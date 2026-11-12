package io.hmg.familydiary
import android.content.Intent
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.Button
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.SpeechSegment
import io.hmg.familydiary.platform.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
class TimelinePlaybackDeviceTest {
 @Test fun rowJumpStartsOriginalAtOffsetAndDrivingRejectsTextNavigation(){
  val i=InstrumentationRegistry.getInstrumentation();val root=File(i.targetContext.cacheDir,"timeline-play-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val dir=File(root,"capture-probe").apply{mkdirs()};val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
  val file=File(dir,"synthetic.wav").apply{writeBytes(PcmWave.header(32000*12L)+ByteArray(32000*12))}
  val rows=listOf(SpeechSegment("합성 첫 말",1000,2000),SpeechSegment("합성 다음 말",5000,7000))
  val r=store.load(file).withSpeech(rows.joinToString("\n"){it.text},rows).edit("고친 확인문","합성 가족","2099-11-11T00:00:00Z").confirm()
  val draft=JSONObject().put("groups",JSONArray().put(JSONObject().put("label","합성 시간축").put("statements",JSONArray().put(JSONObject().put("text","합성 일기")))))
  store.save(r.copy(draft=draft.toString(),draftRevision=r.revision,accepted=r.revision,generationMode="mock"))
  var a:MainActivity?=null;var playback:PlaybackService?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(t:Any,n:String)=t.javaClass.getDeclaredField(n).apply{isAccessible=true}
  fun get(n:String)=field(a!!,n).get(a!!)
  fun set(t:Any,n:String,v:Any)=field(t,n).set(t,v)
  fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{views(v.getChildAt(it))}else emptyList()
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(80)};fail(label)}
  fun command(cmd:String,segment:String="segment-2"):JSONObject{val done=CountDownLatch(1);var result=JSONObject();ui{a!!.javaClass.getDeclaredMethod("referenceCommand",JSONObject::class.java,kotlin.jvm.functions.Function1::class.java).apply{isAccessible=true}.invoke(a,JSONObject().put("cmd",cmd).put("memoryId",file.name).put("segmentId",segment),{r:JSONObject->result=r;done.countDown();Unit})};assertTrue(done.await(5,TimeUnit.SECONDS));return result}
  fun position():Int {var value=0;ui{value=if(playback?.prepared==true)playback?.player?.currentPosition?:0 else 0};return value}
  try{
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   ui{set(a!!,"directory",dir);set(a!!,"store",store);set(a!!,"contexts",contexts);set(a!!,"capture",CaptureProbe(dir));set(a!!,"sync",CloudSync(root,dir,store,contexts));set(get("review")!!,"store",store);a!!.gateTestControls().take(2).forEach{it.isChecked=true}}
   waitFor("service"){playback=get("playbackService") as? PlaybackService;playback!=null}
   val wire=command("read").getJSONObject("snapshot");assertEquals(r.speechTimeline,wire.getJSONObject("speech_timeline").toString());assertEquals(rows.joinToString("\n"){it.text},wire.getJSONArray("raw_history").getString(0))
   assertFalse(command("playSegment").has("error"));waitFor("seek 5s and play"){position()>=5000};assertTrue(position()<6500)
   assertFalse(command("playSegment","segment-1").has("error"));waitFor("jump back while playing"){position() in 1000..2500};assertTrue(playback!!.player!!.isPlaying)
   ui{(get("modeSwitch") as Button).performClick()};assertTrue(command("playSegment").has("error"));assertTrue(playback!!.busy)
   assertEquals(PcmWave.sha256(file),store.load(file).sha256)
  }finally{ui{playback?.stop();a?.finish()};Thread.sleep(300);root.deleteRecursively()}
 }
}
