package io.hmg.familydiary

import android.content.*
import android.media.AudioManager
import android.media.session.MediaController
import android.media.session.MediaSession
import android.os.IBinder
import android.view.KeyEvent
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import io.hmg.familydiary.platform.PlaybackService
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

/** Real Pleos SDK synthesis of synthetic text; never opens the microphone. */
class PlaybackStopDeviceTest {
 @Test fun stopsActualAudioAndMediaButtonsControlOnlyTheActiveQueue() {
  val i=InstrumentationRegistry.getInstrumentation();val context=i.targetContext
  var service:PlaybackService?=null
  val connection=object:ServiceConnection {
   override fun onServiceConnected(name:ComponentName,binder:IBinder){service=(binder as PlaybackService.LocalBinder).service}
   override fun onServiceDisconnected(name:ComponentName){service=null}
  }
  fun ui(block:()->Unit)=i.runOnMainSync(block)
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(80)};fail(label+" / "+service?.notice)}
  val root=File(context.cacheDir,"stop-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val files=(0..1).map{File(root,"synthetic-$it.wav").apply{writeBytes(PcmWave.header(32000)+ByteArray(32000))}}
  val audio=context.getSystemService(AudioManager::class.java)
  val items=files.mapIndexed {index,file->PlaybackService.NarrationItem(file,"합성 검증용 일기 ${index+1}입니다. 실제 가족 기록이 아닙니다. ".repeat(30),"합성 $index")}
  val bound=context.bindService(Intent(context,PlaybackService::class.java),connection,Context.BIND_AUTO_CREATE)
  try {
   assertTrue(bound);waitFor("service binding"){service!=null}
   ui{service!!.setSimulation(Motion.PARKED);service!!.stop()}
   waitFor("idle before test"){!service!!.busy && !audio.isMusicActive}
   val session=service!!.javaClass.getDeclaredField("session").apply{isAccessible=true}.get(service) as MediaSession
   val controller=MediaController(context,session.sessionToken)
   fun mediaKey(code:Int){ui{assertTrue(controller.dispatchMediaButtonEvent(KeyEvent(KeyEvent.ACTION_DOWN,code)));assertTrue(controller.dispatchMediaButtonEvent(KeyEvent(KeyEvent.ACTION_UP,code)))}}
   fun start(){ui{service!!.narrateQueue(items)};waitFor("actual output active"){service!!.speaking && audio.isMusicActive}}
   fun silent(){waitFor("SDK acknowledged and actual output silent"){!service!!.stopping && !service!!.busy && !audio.isMusicActive};assertEquals(0,service!!.queueCount);Thread.sleep(650);assertFalse(audio.isMusicActive)}
   repeat(3){start();ui{service!!.stop()};silent()}
   start();mediaKey(KeyEvent.KEYCODE_MEDIA_NEXT);waitFor("media next"){service!!.queueIndex==1 && service!!.speaking}
   mediaKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS);waitFor("media previous"){service!!.queueIndex==0 && service!!.speaking}
   mediaKey(KeyEvent.KEYCODE_MEDIA_STOP);silent()
   // Stop while a skip is waiting must not start the pending item.
   start();ui{service!!.nextNarration();service!!.stop()};silent()
   // Cancel initialization before a speak request is submitted.
   ui{service!!.narrateQueue(items);service!!.stop()};silent();Thread.sleep(1500);assertFalse(audio.isMusicActive)
  } finally {ui{service?.stop()};Thread.sleep(500);if(bound)context.unbindService(connection);root.deleteRecursively()}
 }
}
