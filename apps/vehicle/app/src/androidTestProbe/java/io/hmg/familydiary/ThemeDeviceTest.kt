package io.hmg.familydiary

import android.content.Intent
import android.graphics.Bitmap
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.Button
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Host microphone MUST be disabled by the runner. Dedicated local synthetic storage, no cloud. */
class ThemeDeviceTest {
 @Test fun systemAndManualThemesKeepAudioRecordingAndUnsentEdits() {
  val i=InstrumentationRegistry.getInstrumentation();val root=File(i.targetContext.filesDir,"driving-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val dir=File(root,"capture-probe").apply{mkdirs()};val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
  val first=File(dir,"synthetic-first.wav");val second=File(dir,"synthetic-second.wav")
  for((index,file) in listOf(first,second).withIndex()) {
   file.writeBytes(PcmWave.header(32000*30L)+ByteArray(32000*30))
   val r=store.load(file).withSpeech("숨겨야 하는 합성 이야기").edit("숨겨야 하는 합성 이야기","합성 가족",if(index==0)"2099-11-09T04:00:00Z" else "2099-11-08T04:00:00Z").confirm()
   val draft=JSONObject().put("groups",JSONArray().put(JSONObject().put("label","합성 주행 검사").put("statements",JSONArray().put(JSONObject().put("text",r.text)))))
   store.save(r.copy(draft=draft.toString(),draftRevision=r.revision,accepted=r.revision,generationMode="mock"))
   contexts.create(file.name,MemoryContext(r.recordedAt,VehicleSnapshot("합성 주행 검사",source="synthetic")))
  }
  val hash=PcmWave.sha256(first)
  val bitmap=Bitmap.createBitmap(40,40,Bitmap.Config.ARGB_8888);val output=java.io.ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.PNG,100,output);bitmap.recycle();val photo=contexts.addPhoto(first.name,output.toByteArray().inputStream())
  var a:MainActivity?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(target:Any,name:String)=target.javaClass.getDeclaredField(name).apply{isAccessible=true}
  fun set(target:Any,name:String,value:Any)=field(target,name).set(target,value)
  fun get(name:String)=field(a!!,name).get(a!!)
  fun views(v:View):List<View> = listOf(v)+if(v is ViewGroup)(0 until v.childCount).flatMap{views(v.getChildAt(it))}else emptyList()
  fun eval(js:String):String {val latch=CountDownLatch(1);var result="";ui{(get("exact") as WebView).evaluateJavascript(js){result=it;latch.countDown()}};assertTrue(latch.await(5,TimeUnit.SECONDS));return result}
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(100)};fail(label)}
  fun command(cmd:String,id:String=first.name):JSONObject {val latch=CountDownLatch(1);var result=JSONObject();ui{a!!.javaClass.getDeclaredMethod("referenceCommand",JSONObject::class.java,kotlin.jvm.functions.Function1::class.java).apply{isAccessible=true}.invoke(a,JSONObject().put("cmd",cmd).put("memoryId",id),{r:JSONObject->result=r;latch.countDown();Unit})};assertTrue(latch.await(5,TimeUnit.SECONDS));return result}
  fun click(name:String)=ui{(get(name) as Button).performClick()}
  fun playerPosition():Int {var pos=0;ui{pos=(get("player") as? MediaPlayer)?.currentPosition?:0};return pos}
  val prefs=i.targetContext.getSharedPreferences("vehicle-profile",0);val savedMode=prefs.getString("display-theme",null)
  fun shell(command:String)=android.os.ParcelFileDescriptor.AutoCloseInputStream(i.uiAutomation.executeShellCommand(command)).bufferedReader().use{it.readText().trim()}
  val savedNight=shell("cmd uimode night").substringAfter("Night mode: ")
  fun theme(mode:String):JSONObject {val latch=CountDownLatch(1);var result=JSONObject();ui {a!!.javaClass.getDeclaredMethod("referenceCommand",JSONObject::class.java,kotlin.jvm.functions.Function1::class.java).apply{isAccessible=true}.invoke(a,JSONObject().put("cmd","setTheme").put("mode",mode),{r:JSONObject->result=r;latch.countDown();Unit})};assertTrue(latch.await(5,TimeUnit.SECONDS));return result}
  fun night(value:String,expected:String){shell("cmd uimode night $value");waitFor("Android uiMode -> $expected"){eval("document.documentElement.dataset.theme")==JSONObject.quote(expected)};assertFalse(a!!.isDestroyed)}
  prefs.edit().putString("display-theme","auto").commit()
  try {
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   ui {
    set(a!!,"directory",dir);set(a!!,"store",store);set(a!!,"contexts",contexts);set(a!!,"capture",CaptureProbe(dir));set(a!!,"sync",CloudSync(root,dir,store,contexts));set(get("review")!!,"store",store)
    views(a!!.window.decorView).filterIsInstance<CheckBox>().take(2).forEach{it.isChecked=true}
   }
   waitFor("bundled web ready"){eval("typeof window.openNativeMemory==='function'")=="true"}
   eval("window.openNativeMemory(${JSONObject.quote(first.name)})")
   waitFor("parked diary visible"){eval("document.body.innerText.includes('숨겨야 하는 합성 이야기')")=="true"}
   assertFalse(command("play").has("error"));waitFor("playback started"){playerPosition()>200}
   val service=get("playbackService");val themeBefore=playerPosition()
   night("yes","dark");assertEquals(0xff0b0d12.toInt(),(get("ui") as VehicleTheme).bg)
   assertFalse(theme("light").has("error"));waitFor("manual light"){eval("document.documentElement.dataset.theme")=="\"light\""}
   night("no","light");night("yes","light") // Manual override beats platform signal.
   assertFalse(theme("auto").has("error"));waitFor("auto dark"){eval("document.documentElement.dataset.theme")=="\"dark\""}
   assertSame(service,get("playbackService"));assertTrue(playerPosition()>themeBefore);night("no","light")
   val before=playerPosition();click("modeSwitch")
   waitFor("audio panel shown"){var yes=false;ui{yes=(get("drivingPanel") as View).isShown && (get("exact") as View).visibility==View.GONE};yes}
   waitFor("original continues on P to D"){playerPosition()>before+400}
   waitFor("review DOM cleared"){eval("document.querySelector('#app').childElementCount===0")=="true"}
   for(cmd in listOf("read","list","edit","createDiary","saveDiary","delete","removePhoto","share","settings","tts","setTheme"))assertTrue("blocked $cmd",command(cmd).has("error"))
   eval("window.__photoStatus=0;fetch('https://chagok.local/_photos/${first.name}/${photo.name}').then(r=>window.__photoStatus=r.status)")
   waitFor("native photo resource blocked"){eval("window.__photoStatus===403")=="true"}
   click("drivingPlay");var paused=false;ui{paused=!(get("player") as MediaPlayer).isPlaying};assertTrue(paused)
   click("drivingPlay");waitFor("resume"){var playing=false;ui{playing=(get("player") as? MediaPlayer)?.isPlaying==true};playing}
   click("drivingPrevious");assertEquals(second,get("selected"));assertNull(get("player"))
   click("drivingPlay");waitFor("start playback in D"){playerPosition()>100}
   ui{a!!.javaClass.getDeclaredMethod("interrupt",String::class.java).apply{isAccessible=true}.invoke(a,"합성 오디오 포커스 상실 · 중단")}
   assertNull(get("player"));assertEquals(hash,PcmWave.sha256(first))
   Thread.sleep(300);assertNull(get("player"))
   // Return to parking and start real AudioRecord with the emulator's host mic off.
   click("modeSwitch");assertFalse(command("start").has("error"))
   waitFor("recorded PCM while parked"){(get("captureElapsed") as Long)>=1000}
   val recordingBefore=get("captureElapsed") as Long
   night("yes","dark");assertTrue((get("capture") as CaptureProbe).busy)
   waitFor("recording continues through theme"){(get("captureElapsed") as Long)>recordingBefore+400}
   click("modeSwitch");assertTrue((get("capture") as CaptureProbe).busy)
   Thread.sleep(1100);click("drivingPause");assertTrue((get("capture") as CaptureProbe).paused)
   click("drivingPause");assertFalse((get("capture") as CaptureProbe).paused)
   Thread.sleep(500);click("drivingFinish")
   waitFor("original finalized in D"){dir.listFiles()!!.count{it.extension=="wav"}==3 && !(get("capture") as CaptureProbe).busy}
   val captured=dir.listFiles()!!.first{it!=first&&it!=second&&it.extension=="wav"};assertTrue(PcmWave.payloadBytes(captured)>32000)
   val capturedHash=PcmWave.sha256(captured)
   // Deterministic STT completion injection tests persistence, not speech accuracy.
   ui {
    (get("speech") as SpeechProbe).cancel()
    set(a!!,"liveFile",captured);set(a!!,"liveText","합성 주행 중 완료된 인식문");set(a!!,"liveApplied",false)
    a!!.javaClass.getDeclaredMethod("applyLiveTranscript").apply{isAccessible=true}.invoke(a)
   }
   assertEquals("합성 주행 중 완료된 인식문",store.load(captured).text)
   assertEquals("true",eval("document.querySelector('#app').childElementCount===0"))
   i.uiAutomation.takeScreenshot()?.let{b->File(i.targetContext.filesDir,"synthetic-driving-mode.png").outputStream().use{b.compress(Bitmap.CompressFormat.PNG,100,it)};b.recycle()}
   click("modeSwitch")
   waitFor("review only after parking"){eval("document.querySelector('[data-review-text]')?.value").contains("합성 주행 중 완료된 인식문")}
   eval("document.querySelector('[data-review-text]').value='수정 중인 합성 문장';document.querySelector('[data-review-text]').dispatchEvent(new Event('input'))")
   eval("window.__themeEditor=document.querySelector('[data-review-text]')")
   night("no","light")
   assertEquals("true",eval("window.__themeEditor===document.querySelector('[data-review-text]')"))
   assertTrue(eval("document.querySelector('[data-review-text]').value").contains("수정 중인 합성 문장"))
   click("modeSwitch");Thread.sleep(200);click("modeSwitch")
   waitFor("unsent edit restored after D/P"){eval("document.querySelector('[data-review-text]')?.value").contains("수정 중인 합성 문장")}
   assertEquals(capturedHash,PcmWave.sha256(captured))
   click("modeSwitch");click("drivingPlay");waitFor("D playback from saved capture"){playerPosition()>100}
   ui{(get("driving") as CheckBox).isChecked=false}
   assertNull(get("player"));assertTrue(command("play",captured.name).has("error"))
   // Fresh launch directly into D: no parked WebView has loaded yet.
   ui{a!!.finish()};Thread.sleep(250)
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   ui {
    set(a!!,"directory",dir);set(a!!,"store",store);set(a!!,"contexts",contexts);set(a!!,"capture",CaptureProbe(dir));set(a!!,"sync",CloudSync(root,dir,store,contexts));set(get("review")!!,"store",store)
    (get("consent") as CheckBox).isChecked=true;(get("driving") as CheckBox).isChecked=true
   }
   click("drivingPlay");waitFor("fresh D audio start"){playerPosition()>200};val continued=playerPosition()
   click("modeSwitch")
   waitFor("first parked WebView opens selected original"){eval("document.querySelector('h1')?.textContent").contains("합성 주행 검사")}
   waitFor("D to P does not stop original"){playerPosition()>continued+200}
   command("stopPlayback");click("modeSwitch");click("drivingRecord")
   waitFor("new recording can start in D"){(get("captureElapsed") as Long)>=1000}
   click("drivingFinish")
   waitFor("new D original preserved"){dir.listFiles()!!.count{it.extension=="wav"}==4 && !(get("capture") as CaptureProbe).busy}
   ui{(get("speech") as SpeechProbe).cancel()}
   click("modeSwitch")
   waitFor("D-started capture opens review after parking"){eval("document.querySelector('h1')?.textContent").contains("확인할 이야기")}
  } finally {
   if(savedMode==null)prefs.edit().remove("display-theme").commit() else prefs.edit().putString("display-theme",savedMode).commit()
   shell("cmd uimode night $savedNight");ui{a?.finish()};Thread.sleep(300);root.deleteRecursively()}
 }
}
