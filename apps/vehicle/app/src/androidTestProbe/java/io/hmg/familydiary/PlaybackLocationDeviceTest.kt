package io.hmg.familydiary

import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import io.hmg.familydiary.platform.*
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

/** Synthetic silence only. SDK capability output excludes all coordinates and personal content. */
class PlaybackLocationDeviceTest {
 @Test fun originalSurvivesNavigationAndRecreationThenStopsOnUnknown() {
  val i=InstrumentationRegistry.getInstrumentation()
  val root=File(i.targetContext.filesDir,"playback-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val original=File(root,"synthetic.wav").apply{writeBytes(PcmWave.header(32000*40L)+ByteArray(32000*40))}
  var a:MainActivity?=null;var service:PlaybackService?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun get(target:Any,name:String):Any?=target.javaClass.getDeclaredField(name).apply{isAccessible=true}.get(target)
  fun waitFor(label:String,condition:()->Boolean){val end=System.currentTimeMillis()+25000;while(System.currentTimeMillis()<end){if(condition())return;Thread.sleep(100)};fail(label)}
  fun position():Int{var p=0;ui{p=if(service?.prepared==true)service?.player?.currentPosition?:0 else 0};return p}
  try {
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   waitFor("media service bound"){service=get(a!!,"playbackService") as? PlaybackService;service!=null && get(a!!,"recordingService")!=null}
   ui{(get(a!!,"recordingService") as RecordingService).setSimulation(Motion.PARKED);service!!.setSimulation(Motion.PARKED);service!!.play(original)}
   waitFor("original begins"){position()>300}
   val before=position()
   i.targetContext.startActivity(Intent().setComponent(android.content.ComponentName("ai.umos.maps.android.navigation.app","ai.umos.maps.android.navigation.app.MainActivity")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   waitFor("activity background"){get(a!!,"foreground")==false}
   waitFor("original continues behind navigation"){position()>before+1200}
   i.targetContext.startActivity(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
   waitFor("activity returned"){get(a!!,"foreground")==true}
   val monitor=i.addMonitor(MainActivity::class.java.name,null,false)
   ui{a!!.recreate()};a=i.waitForMonitorWithTimeout(monitor,10000) as MainActivity;i.removeMonitor(monitor)
   waitFor("same service reattached"){get(a!!,"playbackService")===service}
   assertTrue(service!!.busy);assertTrue(position()>before+1200)
   ui{service!!.setSimulation(Motion.UNKNOWN)}
   assertFalse(service!!.busy);assertNull(service!!.player)
   ui{service!!.setSimulation(Motion.PARKED)};Thread.sleep(300);assertFalse(service!!.busy)
   ui{service!!.play(original)};waitFor("restart by explicit action"){position()>100}
   val focus=service!!.javaClass.getDeclaredMethod("handleFocus",Int::class.javaPrimitiveType).apply{isAccessible=true}
   // Deterministic platform-callback injection verifies policy, not acoustic mixing.
   ui{focus.invoke(service,android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)}
   assertTrue(service!!.ducked);assertTrue(service!!.busy)
   ui{focus.invoke(service,android.media.AudioManager.AUDIOFOCUS_GAIN)}
   assertFalse(service!!.ducked)
   ui{focus.invoke(service,android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT)}
   assertFalse(service!!.busy)
   ui{focus.invoke(service,android.media.AudioManager.AUDIOFOCUS_GAIN)}
   assertFalse(service!!.busy)
   assertEquals(32000*40L,PcmWave.payloadBytes(original))
   // Actual official location adapter: unsupported/no fix remains a recorded capability result.
   val location=RecordingLocation(i.targetContext)
   ui{location.start()};Thread.sleep(2500)
   var status="";ui{status=location.snapshot(System.currentTimeMillis()).status;location.close()}
   assertTrue(status in setOf("available","unavailable","stale","denied","unsupported","error"))
   println("C021 official location result=$status (coordinates omitted)")
  } finally {ui{service?.stop();a?.finish()};Thread.sleep(300);root.deleteRecursively()}
 }
 @Test fun officialNarrationStartsAndNotificationStopEndsIt() {
  val i=InstrumentationRegistry.getInstrumentation();var a:MainActivity?=null;var service:PlaybackService?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun get(target:Any,name:String):Any?=target.javaClass.getDeclaredField(name).apply{isAccessible=true}.get(target)
  fun waitFor(label:String,condition:()->Boolean){val end=System.currentTimeMillis()+25000;while(System.currentTimeMillis()<end){if(condition())return;Thread.sleep(100)};fail(label+" / "+service?.notice)}
  try {
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   waitFor("bound"){service=get(a!!,"playbackService") as? PlaybackService;service!=null && get(a!!,"recordingService")!=null}
   ui{
    (get(a!!,"recordingService") as RecordingService).setSimulation(Motion.PARKED);service!!.setSimulation(Motion.PARKED)
    service!!.narrate(File(i.targetContext.cacheDir,"synthetic-narration.wav"),"이것은 합성 일기 읽기 검사입니다. 가족이 말한 추억을 자동차의 목소리로 남깁니다. ".repeat(8))
   }
   waitFor("Pleos TTS onStart"){service!!.speaking}
   i.targetContext.startActivity(Intent().setComponent(android.content.ComponentName("ai.umos.maps.android.navigation.app","ai.umos.maps.android.navigation.app.MainActivity")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
   waitFor("background"){get(a!!,"foreground")==false}
   Thread.sleep(700);assertTrue("narration persists across screen switch / "+service!!.notice,service!!.busy)
   i.targetContext.startService(Intent(i.targetContext,PlaybackService::class.java).setAction("stop"))
   waitFor("notification stop"){!service!!.busy};assertFalse(service!!.speaking)
  } finally {ui{service?.stop();a?.finish()}}
 }
}
