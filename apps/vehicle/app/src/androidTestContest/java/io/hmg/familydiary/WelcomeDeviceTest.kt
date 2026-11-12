package io.hmg.familydiary

import android.content.Intent
import android.os.ParcelFileDescriptor
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import android.webkit.WebView

class WelcomeDeviceTest {
 @Test fun entryPreservesConsentAndMotionBoundaries() {
  val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
  val a=i.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(name:String)=MainActivity::class.java.getDeclaredField(name).apply{isAccessible=true}.get(a)
  fun waitFor(label:String,test:()->Boolean) {val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){var ok=false;ui{ok=test()};if(ok)return;Thread.sleep(40)};fail(label)}
  fun eval(js:String):String {val done=CountDownLatch(1);var result="";ui{(field("exact") as WebView).evaluateJavascript(js){result=it;done.countDown()}};assertTrue(done.await(5,TimeUnit.SECONDS));return result}
  fun waitJs(label:String,js:String) {val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(eval(js)=="true")return;Thread.sleep(70)};fail(label+": "+eval("document.body.innerText"))}
  fun shot(name:String) {i.waitForIdleSync();Thread.sleep(250);ParcelFileDescriptor.AutoCloseInputStream(i.uiAutomation.executeShellCommand("screencap -p /data/local/tmp/$name.png")).use{it.readBytes()}}
  val originalTheme=VehicleTheme.mode(ctx)
  try {
   waitFor("services ready"){field("initialized")==true && field("recordingService")!=null && field("playbackService")!=null}
   assumeTrue("Isolated unpaired app required",!(field("sync") as CloudSync).paired)
   val service=field("recordingService") as RecordingService
   val welcome=field("welcome") as WelcomePanel
   val motion=field("modeSwitch") as Button
   val consent=field("consent") as CheckBox
   assertFalse(service.capture.busy)
   ui{consent.isChecked=false;service.setSimulation(null)}
   waitFor("welcome shown"){welcome.isShown}
   ui{
    assertNull((field("parked") as View).parent)
    assertNull((field("driving") as View).parent)
    assertNull(consent.parent)
    assertFalse(welcome.acknowledgement.isChecked);assertFalse(welcome.start.isEnabled)
    assertFalse(motion.isShown)
    welcome.start.performClick();assertFalse(service.consent);assertFalse(service.capture.busy)
   }
   for(theme in listOf("light","dark")) {
    ui{VehicleTheme.select(ctx,theme);MainActivity::class.java.getDeclaredMethod("applyAppearance").apply{isAccessible=true}.invoke(a)}
    waitFor("controls measured"){welcome.start.width>0 && welcome.start.height>=ctx.resources.displayMetrics.density*48}
    shot("c039-welcome-$theme")
   }
   val command=MainActivity::class.java.getDeclaredMethod("referenceCommand",JSONObject::class.java,kotlin.jvm.functions.Function1::class.java).apply{isAccessible=true}
   var reply:JSONObject?=null
   ui{command.invoke(a,JSONObject().put("cmd","list"),{v:JSONObject->reply=v})}
   assertTrue("No records before consent",reply!!.has("error"))
   ui{welcome.acknowledgement.isChecked=true;assertTrue(welcome.start.isEnabled);welcome.start.performClick()}
   waitFor("parked home"){service.consent && service.motion==Motion.PARKED && (field("exact") as View).isShown && motion.isShown}
   assertFalse(service.capture.busy)
   waitJs("rendered recording home","document.querySelector('[data-page=carhome]')?.style.visibility === 'visible' && document.body.innerText.includes('녹음')")
   shot("c039-entered-home")
   ui{motion.performClick()};waitFor("driving"){service.motion==Motion.DRIVING}
   waitJs("driving surface","!!document.querySelector('[data-driving-surface]')")
   ui{motion.performClick()};waitFor("parked again"){service.motion==Motion.PARKED}
   waitJs("no recording returns home","document.querySelector('[data-page=carhome]')?.style.visibility === 'visible' && !document.querySelector('[data-review-text]')")
   ui{service.setSimulation(Motion.UNKNOWN)}
   waitFor("unknown blocks"){welcome.isShown && !welcome.start.isEnabled}
   ui{welcome.start.performClick();assertEquals(Motion.UNKNOWN,service.motion);assertFalse(service.capture.busy)}
   shot("c039-unknown")
   ui{motion.performClick()};waitFor("explicit test recovery"){service.motion==Motion.PARKED && !welcome.isShown}
   ui{consent.isChecked=false;service.setSimulation(Motion.DRIVING)}
   waitFor("consent gate for known driving"){welcome.isShown}
   ui{welcome.acknowledgement.isChecked=true;welcome.start.performClick()}
   assertEquals("Known driving never replaced with P",Motion.DRIVING,service.motion)
   assertTrue(service.consent);assertFalse(service.capture.busy)
   ui{consent.isChecked=false}
   waitFor("consent revoked"){welcome.isShown && !service.consent}
   ui{welcome.later.performClick()}
   waitFor("decline closes"){a.isFinishing}
  } finally {
   ui{VehicleTheme.select(ctx,originalTheme);a.finish()}
  }
 }
}
