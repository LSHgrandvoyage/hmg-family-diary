package io.hmg.familydiary

import android.content.Intent
import android.view.View
import android.webkit.WebView
import android.widget.Button
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import io.hmg.familydiary.platform.*
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** C044: entry boundaries and actual background audio, using a cache-only silent fixture. */
class WelcomeDeviceTest {
 @Test fun entryAndParkedPlayerPreserveBoundaries() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
  val a=i.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(name:String)=MainActivity::class.java.getDeclaredField(name).apply{isAccessible=true}.get(a)
  fun waitFor(label:String,test:()->Boolean) {val end=System.currentTimeMillis()+20000;while(System.currentTimeMillis()<end){var ok=false;ui{ok=test()};if(ok)return;Thread.sleep(50)};fail(label)}
  fun eval(web:WebView,js:String):String {val done=CountDownLatch(1);var result="";ui{web.evaluateJavascript(js){result=it;done.countDown()}};assertTrue(done.await(5,TimeUnit.SECONDS));return result}
  fun waitJs(web:WebView,label:String,js:String) {val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(eval(web,js)=="true")return;Thread.sleep(70)};fail(label)}
  val originalTheme=VehicleTheme.mode(ctx)
  var ownAudio=false;var fixture:File?=null
  try {
   waitFor("services ready"){field("initialized")==true&&field("recordingService")!=null&&field("playbackService")!=null}
   val service=field("recordingService") as RecordingService
   val playback=field("playbackService") as PlaybackService
   assumeTrue("Never interrupt user recording/playback",!service.capture.busy&&!playback.busy)
   val welcome=field("welcome") as WelcomePanel;val web=welcome.web
   val consent=field("consent") as CheckBox;val motion=field("modeSwitch") as Button
   ui{consent.isChecked=false;welcome.reset();service.setSimulation(null)}
   waitFor("welcome shown"){welcome.isShown}
   waitJs(web,"unchecked entry","document.querySelectorAll('[data-consent]:checked').length===0 && document.querySelector('[data-start]')?.disabled===true")
   eval(web,"document.querySelectorAll('[data-consent]')[0].click()")
   waitFor("one consent does not grant entry"){welcome.acknowledgement.isChecked&&!welcome.accepted&&!welcome.start.isEnabled}
   ui{welcome.start.performClick()};assertFalse(service.consent)
   eval(web,"document.querySelector('[data-consent-all]').click()")
   waitFor("all consents unlock entry"){welcome.accepted&&welcome.start.isEnabled}
   eval(web,"document.querySelectorAll('[data-consent]')[1].click()")
   waitFor("individual revoke locks entry"){!welcome.accepted&&!welcome.start.isEnabled}
   eval(web,"document.querySelector('[data-policy]').click()")
   waitJs(web,"notice opens","document.querySelector('dialog')?.open===true")
   eval(web,"document.querySelector('[data-close]').click()")
   for(theme in listOf("light","dark")) {
    ui{VehicleTheme.select(ctx,theme);MainActivity::class.java.getDeclaredMethod("applyAppearance").apply{isAccessible=true}.invoke(a)}
    waitJs(web,"theme applied","document.documentElement.dataset.theme === '$theme'")
   }
   eval(web,"document.querySelector('[data-consent-all]').click()")
   waitFor("all required again"){welcome.accepted}
   eval(web,"document.querySelector('[data-start]').click()")
   waitFor("explicit entry is parked and not recording"){service.consent&&service.motion==Motion.PARKED&&!welcome.isShown&&motion.isShown}
   assertFalse(service.capture.busy)
   val exact=field("exact") as WebView
   waitJs(exact,"home ready","document.querySelector('[data-page=carhome]')?.style.visibility==='visible'")
   waitJs(exact,"adaptive fills actual WebView","(()=>{const r=document.querySelector('#app>div')?.getBoundingClientRect();return !!r&&Math.abs(r.y)<1&&Math.abs(r.height-innerHeight)<1&&Math.abs(r.width-innerWidth)<1})()")
   // Not in capture-probe, so no discoverable diary or auto-upload candidate is created.
   fixture=File(ctx.cacheDir,"c044-${UUID.randomUUID()}.wav").apply{writeBytes(PcmWave.header(1920000)+ByteArray(1920000))}
   val file=fixture!!;ownAudio=true
   ui{playback.setSimulation(Motion.PARKED);playback.play(file)}
   waitFor("silent original playing"){playback.player?.isPlaying==true}
   ui{motion.performClick()};waitFor("D retains audio"){service.motion==Motion.DRIVING&&playback.player?.isPlaying==true}
   ui{motion.performClick()};waitFor("P retains audio"){service.motion==Motion.PARKED&&playback.player?.isPlaying==true}
   waitJs(exact,"original player visible at home","!!document.querySelector('[data-page=carhome] .parked-player') && document.querySelector('[data-player-mode]')?.textContent.includes('목소리')")
   eval(exact,"document.querySelector('[data-player-command=listenToggle]').click()")
   waitFor("pause reaches real MediaPlayer"){playback.prepared&&playback.player?.isPlaying==false}
   eval(exact,"document.querySelector('[data-player-command=listenToggle]').click()")
   waitFor("resume reaches same MediaPlayer"){playback.player?.isPlaying==true&&playback.file==file}
   for(page in listOf("carlist","carsettings","carhome")) {
    eval(exact,"window.restoreNativeView('$page',null)")
    waitJs(exact,"persistent controls on $page","document.querySelector('[data-page=$page]')?.style.visibility==='visible' && !!document.querySelector('.parked-player')")
    assertEquals(file,playback.file);assertTrue(playback.player?.isPlaying==true)
   }
   eval(exact,"document.querySelector('[data-player-command=listenExit]').click()")
   waitFor("original stops"){!playback.busy}
   ui{playback.narrateQueue(listOf(PlaybackService.NarrationItem(file,"합성 시험 문장입니다. ".repeat(30),"합성 시험 일기")))}
   waitFor("actual TTS starts"){playback.speaking}
   ui{motion.performClick();motion.performClick()}
   waitJs(exact,"TTS bar after D/P","document.querySelector('[data-player-mode]')?.textContent.startsWith('일기 · ')===true")
   eval(exact,"document.querySelector('[data-player-command=listenExit]').click()")
   waitFor("TTS stop acknowledgement"){!playback.busy&&!playback.settling}
   waitJs(exact,"no ghost player","!document.querySelector('.parked-player')")
   ui{service.setSimulation(Motion.UNKNOWN)}
   waitFor("UNKNOWN still blocks"){welcome.isShown&&!welcome.start.isEnabled}
   ui{welcome.start.performClick()};assertEquals(Motion.UNKNOWN,service.motion);assertFalse(service.capture.busy)
   ui{service.setSimulation(Motion.PARKED)}
  } finally {
   ui{if(ownAudio)(field("playbackService") as? PlaybackService)?.stop();VehicleTheme.select(ctx,originalTheme);a.finish()}
   i.waitForIdleSync()
   fixture?.let{ReviewStore(File(ctx.filesDir,"capture-review")).delete(it.name);it.delete()}
  }
 }
}
