package io.hmg.familydiary

import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.view.View
import android.webkit.WebView
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import io.hmg.familydiary.platform.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

/** Silent emulator AudioRecord, private synthetic directory. No user recording is read. */
class BackgroundRecordingDeviceTest {
 @Test fun navigationAndActivityRecreationKeepOneRecordingThenSaveInService() {
  val i=InstrumentationRegistry.getInstrumentation()
  val root=File(i.targetContext.filesDir,"background-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val dir=File(root,"capture-probe").apply{mkdirs()};val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
  var a:MainActivity?=null;var service:RecordingService?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun get(target:Any,name:String):Any?=target.javaClass.getDeclaredField(name).apply{isAccessible=true}.get(target)
  fun set(target:Any,name:String,value:Any)=target.javaClass.getDeclaredField(name).apply{isAccessible=true}.set(target,value)
  fun waitFor(message:String,test:()->Boolean){val end=System.currentTimeMillis()+45000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(100)};fail(message)}
  fun setup(activity:MainActivity){
   set(activity,"directory",dir);set(activity,"store",store);set(activity,"contexts",contexts);set(activity,"sync",CloudSync(root,dir,store,contexts));set(get(activity,"review")!!,"store",store)
  }
  try {
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   waitFor("service bound"){service=get(a!!,"recordingService") as? RecordingService;service!=null}
   // Automatic AAOS observation is recorded separately, without assuming synthetic P is real-car proof.
   waitFor("vehicle signal callback"){service!!.source!="차량 신호 연결 중"}
   println("AAOS observed: "+service!!.source+" / "+service!!.motion.name)
   ui {
    setup(a!!);set(a!!,"capture",CaptureProbe(dir))
    service!!.setSimulation(Motion.PARKED)
    (get(a!!,"consent") as CheckBox).isChecked=true
    a!!.javaClass.getDeclaredMethod("startCapture").apply{isAccessible=true}.invoke(a)
   }
   waitFor("PCM written"){service!!.elapsed>=1000}
   val started=service!!.elapsed
   // Real navigation Activity when installed, otherwise launcher (same Android lifecycle).
   val target=Intent().setComponent(android.content.ComponentName("ai.umos.maps.android.navigation.app","ai.umos.maps.android.navigation.app.MainActivity"))
   i.targetContext.startActivity(target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   waitFor("diary is background"){get(a!!,"foreground")==false}
   waitFor("recording progresses behind navigation"){service!!.elapsed>=started+2000}
   assertTrue(service!!.capture.busy)
   // Recreate the Activity without removing the task (explicit task removal ends recording).
   i.targetContext.startActivity(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
   waitFor("returned before recreation"){get(a!!,"foreground")==true}
   val activityMonitor=i.addMonitor(MainActivity::class.java.name,null,false)
   ui {a!!.recreate()}
   a=i.waitForMonitorWithTimeout(activityMonitor,10000) as MainActivity
   i.removeMonitor(activityMonitor)
   assertTrue(service!!.capture.busy)
   waitFor("same service reattached"){get(a!!,"recordingService")===service}
   ui {setup(a!!)}
   assertTrue(service!!.elapsed>=started+2000)
   val audio=i.targetContext.getSystemService(AudioManager::class.java)
   val navFocus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
    .setOnAudioFocusChangeListener{}.build()
   ui {audio.requestAudioFocus(navFocus)}
   val beforeDuck=service!!.elapsed
   waitFor("navigation duck preserves capture"){service!!.elapsed>=beforeDuck+1000}
   ui {audio.abandonAudioFocusRequest(navFocus);service!!.setSimulation(Motion.DRIVING)}
   waitFor("driving UI hides private content"){var yes=false;ui{yes=(get(a!!,"exact") as WebView).visibility==View.GONE};yes}
   // End using the notification's same Service action while the Activity is backgrounded.
   i.targetContext.startActivity(target.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   waitFor("background again"){get(a!!,"foreground")==false}
   // Inject deterministic transcript text to verify service-owned persistence; not an STT accuracy claim.
   ui {set(service!!,"text","합성 백그라운드 인식문 보존 검사")}
   i.targetContext.startService(Intent(i.targetContext,RecordingService::class.java).setAction("finish"))
   waitFor("saved WAV and STT settled"){service!!.resultFile!=null && !service!!.capture.busy && !service!!.speech.busy}
   val file=service!!.resultFile!!
   assertEquals(dir.canonicalPath,file.parentFile!!.canonicalPath)
   assertTrue(PcmWave.payloadBytes(file)>=32000*4)
   assertEquals(1,dir.listFiles()!!.count{it.extension=="wav"})
   assertNotNull(contexts.load(file.name))
   assertEquals("합성 백그라운드 인식문 보존 검사",store.load(file).text)
   val hash=PcmWave.sha256(file)
   i.targetContext.startActivity(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
   waitFor("back to foreground"){get(a!!,"foreground")==true}
   ui {service!!.setSimulation(Motion.PARKED)}
   assertEquals(hash,PcmWave.sha256(file))
   assertFalse(service!!.capture.busy)
   // An unknown vehicle state finalizes capture and never starts it again on recovery.
   ui {service!!.begin(MemoryContext("2099-01-01T00:00:00Z",VehicleSnapshot("합성",source="synthetic")))}
   waitFor("second capture"){service!!.elapsed>=1000}
   ui {service!!.setSimulation(Motion.UNKNOWN)}
   waitFor("unknown state stopped"){!service!!.capture.busy}
   ui {service!!.setSimulation(Motion.PARKED)}
   Thread.sleep(400);assertFalse(service!!.capture.busy)
  } finally {
   ui {service?.interrupt("합성 검사 종료");a?.finish()}
   Thread.sleep(500)
   root.deleteRecursively()
  }
 }
}
