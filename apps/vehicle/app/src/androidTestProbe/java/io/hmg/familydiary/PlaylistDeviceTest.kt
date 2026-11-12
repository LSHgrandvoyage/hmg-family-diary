package io.hmg.familydiary

import android.content.Intent
import android.media.AudioManager
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.Button
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import ai.pleos.playground.tts.listener.EventListener
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import io.hmg.familydiary.platform.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Only synthetic narration and a dedicated store. No user audio or external AI. */
class PlaylistDeviceTest {
 @Test fun queueCompletesBehindNavigationAndRejectsLateCallbacksAfterStops() {
  val i=InstrumentationRegistry.getInstrumentation()
  val root=File(i.targetContext.filesDir,"playlist-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val dir=File(root,"capture-probe").apply{mkdirs()};val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
  val files=(0..2).map {File(dir,"synthetic-$it.wav")}
  files.forEachIndexed {index,file->
   file.writeBytes(PcmWave.header(32000L)+ByteArray(32000))
   val value=if(index==0)"첫 번째 합성 일기입니다." else "두 번째 합성 일기입니다. 가족과 함께한 기억을 듣고 있습니다. ".repeat(12)
   val r=store.load(file).edit(value,"합성 가족","2099-11-0${9-index}T04:00:00Z").confirm()
   val draft=JSONObject().put("groups",JSONArray().put(JSONObject().put("label","합성 일기 $index").put("statements",JSONArray().put(JSONObject().put("text",value)))))
   store.save(r.copy(draft=draft.toString(),draftRevision=r.revision,accepted=if(index==2)-1 else r.revision,generationMode="mock"))
  }
  var a:MainActivity?=null;var service:PlaybackService?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(target:Any,name:String)=target.javaClass.getDeclaredField(name).apply{isAccessible=true}
  fun get(target:Any,name:String)=field(target,name).get(target)
  fun set(target:Any,name:String,value:Any)=field(target,name).set(target,value)
  fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{views(v.getChildAt(it))}else emptyList()
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(100)};fail(label+" / "+service?.notice)}
  fun command(cmd:String,ids:List<File> = files.take(2)):JSONObject {
   val latch=CountDownLatch(1);var result=JSONObject()
   ui{a!!.javaClass.getDeclaredMethod("referenceCommand",JSONObject::class.java,kotlin.jvm.functions.Function1::class.java).apply{isAccessible=true}.invoke(a,JSONObject().put("cmd",cmd).put("memoryIds",JSONArray(ids.map{it.name})).put("memoryId",files[0].name),{r:JSONObject->result=r;latch.countDown();Unit})}
   assertTrue(latch.await(5,TimeUnit.SECONDS));return result
  }
  fun click(name:String)=ui{(get(a!!,name) as Button).performClick()}
  fun focus(change:Int)=ui{service!!.javaClass.getDeclaredMethod("handleFocus",Int::class.javaPrimitiveType).apply{isAccessible=true}.invoke(service,change)}
  fun callback()=get(service!!,"events") as EventListener
  fun noResume(){waitFor("engine shutdown acknowledged"){!service!!.busy};Thread.sleep(350);assertFalse(service!!.busy);assertEquals(0,service!!.queueCount);ui{service!!.nextNarration();service!!.previousNarration()};assertFalse(service!!.busy)}
  try {
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   ui{
    set(a!!,"directory",dir);set(a!!,"store",store);set(a!!,"contexts",contexts);set(a!!,"capture",CaptureProbe(dir));set(a!!,"sync",CloudSync(root,dir,store,contexts));set(get(a!!,"review")!!,"store",store)
    a!!.gateTestControls().take(2).forEach{it.isChecked=true}
   }
   waitFor("services bound"){service=get(a!!,"playbackService") as? PlaybackService;service!=null && get(a!!,"recordingService")!=null}
   ui{service!!.setSimulation(Motion.PARKED)}
   assertTrue("unconfirmed diary rejected",command("ttsQueue",files).has("error"));assertFalse(service!!.busy)
   assertTrue("duplicate rejected",command("ttsQueue",listOf(files[0],files[0])).has("error"));assertFalse(service!!.busy)
   assertFalse(command("ttsQueue").has("error"))
   waitFor("official first onStart"){service!!.speaking && service!!.queueIndex==0}
   assertFalse(service!!.hasPrevious);assertTrue(service!!.hasNext)
   val old=callback()
   i.targetContext.startActivity(Intent().setComponent(android.content.ComponentName("ai.umos.maps.android.navigation.app","ai.umos.maps.android.navigation.app.MainActivity")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   waitFor("navigation foreground"){get(a!!,"foreground")==false}
   waitFor("natural SDK onDone starts next behind navigation"){service!!.queueIndex==1 && service!!.speaking}
   assertFalse(service!!.hasNext);assertTrue(service!!.hasPrevious)
   old.onDone();old.onStop();Thread.sleep(250);assertEquals(1,service!!.queueIndex);assertTrue(service!!.busy)
   i.targetContext.startActivity(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
   waitFor("return"){get(a!!,"foreground")==true}
   val state=command("state");assertEquals(1,state.getInt("tts_index"));assertEquals(2,state.getInt("tts_count"))
   click("modeSwitch");assertTrue(service!!.busy)
   i.waitForIdleSync();Thread.sleep(600)
   ui { for(name in listOf("drivingTtsStart","drivingTtsPrevious","drivingTtsNext","drivingTtsStop")) {
    val button=get(a!!,name) as Button;val bounds=android.graphics.Rect()
    assertTrue("$name visible",button.getGlobalVisibleRect(bounds));assertEquals("$name not clipped",button.height,bounds.height())
   } }
   i.uiAutomation.takeScreenshot()?.let{b->File(i.targetContext.filesDir,"synthetic-playlist-driving.png").outputStream().use{b.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)};b.recycle()}
   assertTrue("complex queue selection blocked driving",command("ttsQueue").has("error"))
   assertFalse(command("ttsPrevious").has("error"));waitFor("previous restarts"){service!!.queueIndex==0 && service!!.speaking}
   assertFalse(command("ttsNext").has("error"));waitFor("next starts"){service!!.queueIndex==1 && service!!.speaking}
   // Notification actions delegate to the same queue, and never wrap at a boundary.
   i.targetContext.startService(Intent(i.targetContext,PlaybackService::class.java).setAction("next"));Thread.sleep(150);assertEquals(1,service!!.queueIndex)
   val stopped=callback();i.targetContext.startService(Intent(i.targetContext,PlaybackService::class.java).setAction("stop"))
   waitFor("notification stop"){!service!!.busy};stopped.onDone();noResume()
   click("drivingTtsStart");waitFor("native driving start"){service!!.speaking};assertEquals(2,service!!.queueCount)
   val lost=callback();focus(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT);lost.onDone();focus(AudioManager.AUDIOFOCUS_GAIN);noResume()
   click("drivingTtsStart");waitFor("explicit restart"){service!!.speaking};val unknown=callback()
   ui{service!!.setSimulation(Motion.UNKNOWN)};unknown.onDone();ui{service!!.setSimulation(Motion.DRIVING)};noResume()
   click("drivingTtsStart");waitFor("restart for duck"){service!!.speaking};focus(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK);focus(AudioManager.AUDIOFOCUS_GAIN);noResume()
   click("drivingTtsStart");waitFor("restart for SDK stop"){service!!.speaking};val sdkStop=callback();ui{(get(service!!,"tts") as ai.pleos.playground.tts.TextToSpeech).stop()};waitFor("SDK stop cleared queue"){!service!!.busy};sdkStop.onDone();noResume()
   click("drivingTtsStart");waitFor("restart for error"){service!!.speaking};val failed=callback()
   failed.onError(ai.pleos.playground.tts.constant.ErrorType.values().first());waitFor("SDK error clears queue"){!service!!.busy};failed.onDone();noResume()
   click("drivingTtsStart")
   ui{(get(service!!,"timeout") as Runnable).run()};noResume()
   // The same bridge used by the faithful "듣기 종료" button must silence SDK output.
   click("drivingTtsStart");waitFor("restart for UI stop"){service!!.speaking}
   assertFalse(command("stopPlayback").has("error"));noResume()
   waitFor("actual output stopped from bridge"){!i.targetContext.getSystemService(AudioManager::class.java).isMusicActive}
   // A complete two-item short queue must stop at the end, never loop.
   ui{service!!.narrateQueue(files.take(2).mapIndexed {index,f->PlaybackService.NarrationItem(f,"합성 일기 ${index+1}입니다.","합성 $index")})}
   waitFor("short queue starts"){service!!.speaking};waitFor("natural final completion"){!service!!.busy};assertEquals("일기 목록을 모두 들었어요.",service!!.notice);noResume()
   assertEquals(32000L,PcmWave.payloadBytes(files[0]));assertEquals(-1,store.load(files[2]).accepted)
  } finally {ui{service?.stop();a?.finish()};Thread.sleep(400);root.deleteRecursively()}
 }
}
