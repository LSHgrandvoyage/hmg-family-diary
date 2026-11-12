package io.hmg.familydiary

import android.content.Intent
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.UUID

class DrivingListenDeviceTest {
 @Test fun switchesSameDiaryBetweenTtsAndOriginal() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
  val a=i.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun get(name:String)=MainActivity::class.java.getDeclaredField(name).apply{isAccessible=true}.get(a)
  fun waitFor(label:String,test:()->Boolean) {val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){var ok=false;ui{ok=test()};if(ok)return;Thread.sleep(50)};fail(label)}
  val store=ReviewStore(File(ctx.filesDir,"capture-review"));var file:File?=null
  try {
   waitFor("initialized"){get("initialized")==true && get("playbackService")!=null}
   assumeTrue("Unpaired test app required",!(get("sync") as CloudSync).paired)
   file=File(ctx.filesDir,"capture-probe/c038-${UUID.randomUUID()}.wav").apply{parentFile.mkdirs();writeBytes(PcmWave.header(320000)+ByteArray(320000))}
   val f=file!!;var r=store.load(f).edit("합성 이야기","합성 가족","2099-11-13T00:00:00Z").confirm()
   r=r.adopt(LocalDiaryMock.generate(r.input()));store.save(r.copy(accepted=r.revision))
   val select=MainActivity::class.java.getDeclaredMethod("selectReference",File::class.java).apply{isAccessible=true}
   val listen=MainActivity::class.java.getDeclaredMethod("drivingListen",String::class.java).apply{isAccessible=true}
   ui{(get("parked") as CheckBox).isChecked=true;(get("consent") as CheckBox).isChecked=true;select.invoke(a,f);(get("driving") as CheckBox).isChecked=true}
   val service=get("playbackService") as PlaybackService
   ui{listen.invoke(a,"listenToggle")}
   waitFor("TTS starts"){service.narrating};assertEquals(f,service.file)
   ui{listen.invoke(a,"listenOriginal")}
   waitFor("same original starts after TTS stop"){service.player?.isPlaying==true}
   assertEquals(f,service.file);assertEquals("original",get("drivingListenMode"))
   ui{listen.invoke(a,"listenToggle")}
   waitFor("original paused"){service.prepared && service.player?.isPlaying==false}
   ui{listen.invoke(a,"listenDiary")}
   waitFor("paused switch stays stopped"){!service.busy}
   assertEquals("diary",get("drivingListenMode"));assertEquals(f,get("selected"))
   ui{listen.invoke(a,"listenToggle")};waitFor("TTS restarts"){service.narrating}
   ui{listen.invoke(a,"listenToggle")};waitFor("TTS stops"){!service.busy}
  } finally {
   ui{(get("playbackService") as? PlaybackService)?.stop();a.finish()}
   file?.let{store.delete(it.name);it.delete()}
  }
 }
}
