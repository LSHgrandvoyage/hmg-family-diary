package io.hmg.familydiary

import android.content.Intent
import android.view.View
import android.webkit.WebView
import android.widget.Button
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.InputLevel
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Isolated empty library and generated PCM levels. Does not open the microphone. */
class NavigationAppearanceDeviceTest {
 @Test fun settingsRoundTripAndDirectThemeKeepFaithfulRecordingWave(){
  val i=InstrumentationRegistry.getInstrumentation()
  val root=File(i.targetContext.cacheDir,"navigation-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val dir=File(root,"capture-probe").apply{mkdirs()};val store=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"));val capture=CaptureProbe(dir)
  val prefs=i.targetContext.getSharedPreferences("vehicle-profile",0);val saved=prefs.getString("display-theme",null);val savedProfile=prefs.getString("profile",null)
  var a:MainActivity?=null
  fun ui(fn:()->Unit)=i.runOnMainSync(fn)
  fun field(t:Any,n:String)=t.javaClass.getDeclaredField(n).apply{isAccessible=true}
  fun set(t:Any,n:String,v:Any)=field(t,n).set(t,v)
  fun get(n:String)=field(a!!,n).get(a!!)
  fun eval(js:String):String{val done=CountDownLatch(1);var result="";ui{(get("exact") as WebView).evaluateJavascript(js){result=it;done.countDown()}};assertTrue(done.await(5,TimeUnit.SECONDS));return result}
  fun waitFor(label:String,test:()->Boolean){val end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(80)};fail(label)}
  fun command(cmd:String,mode:String="",payload:JSONObject=JSONObject()):JSONObject{val done=CountDownLatch(1);var result=JSONObject();ui{a!!.javaClass.getDeclaredMethod("referenceCommand",JSONObject::class.java,kotlin.jvm.functions.Function1::class.java).apply{isAccessible=true}.invoke(a,payload.put("cmd",cmd).put("mode",mode),{r:JSONObject->result=r;done.countDown();Unit})};assertTrue(done.await(10,TimeUnit.SECONDS));return result}
  fun emit(){ui{val state=a!!.javaClass.getDeclaredMethod("referenceState").apply{isAccessible=true}.invoke(a) as JSONObject;(get("exact") as ExactDiaryView).state(state)}}
  fun theme(value:String){assertFalse(command("setTheme",value).has("error"));waitFor("theme $value"){eval("document.documentElement.dataset.theme")==JSONObject.quote(value)}}
  fun route(value:String){waitFor("faithful $value"){eval("document.querySelector('[data-page]')?.dataset.page")==JSONObject.quote(value) && eval("document.querySelector('[data-page]')?.style.visibility")==JSONObject.quote("visible")};assertEquals(View.VISIBLE,(get("exact") as View).visibility);assertEquals(View.GONE,(get("nativeShell") as View).visibility)}
  try{
   prefs.edit().putString("profile",VehicleSnapshot("합성 우리 차","합성 제조사","합성 모델","SUV","2025","합성 번호").json().toString()).commit()
   contexts.create("synthetic-history.wav",MemoryContext("2099-11-12T00:00:00Z",VehicleSnapshot("과거 합성 차")))
   a=i.startActivitySync(Intent(i.targetContext,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
   ui{
    set(a!!,"directory",dir);set(a!!,"store",store);set(a!!,"contexts",contexts);set(a!!,"capture",capture);set(a!!,"sync",CloudSync(root,dir,store,contexts));set(get("review")!!,"store",store)
    (get("parked") as CheckBox).isChecked=true;(get("consent") as CheckBox).isChecked=true
   }
   waitFor("initial web"){eval("!!document.querySelector('[data-theme-cycle]')")=="true"}
   for(mode in listOf("light","dark")){
    theme(mode)
    for(index in listOf(1,0,1,0)){
     assertFalse(command("settings").has("error"));route("carsettings")
     eval("document.querySelector('.settings-rail a[href=\"${if(index==1)"CarHome.dc.html" else "CarList.dc.html"}\"]').click()")
     route(if(index==1)"carhome" else "carlist")
     assertFalse(capture.busy);assertEquals(false,get("nativeEditor"))
    }
    command("settings");route("carsettings");ui{a!!.onBackPressed()};route("carlist")
    for(expected in if(mode=="light")listOf("dark","auto","light") else listOf("auto","light","dark")) {
     eval("document.querySelector('[data-theme-cycle]').click()")
     waitFor("cycle $expected"){VehicleTheme.mode(i.targetContext)==expected}
     assertEquals("1",eval("document.querySelectorAll('.theme-shortcut button').length"))
    }

   }
   command("settings");route("carsettings")
   assertTrue(command("pairVehicle",payload=JSONObject().put("code","123").put("label","합성")).has("error"))
   assertTrue(command("renameVehicle",payload=JSONObject().put("label","")).has("error"))
   val tooLong=VehicleSnapshot("x".repeat(61)).json()
   assertTrue(command("saveVehicle",payload=JSONObject().put("vehicle",tooLong)).has("error"))
   eval("document.querySelector('[data-vehicle-edit]').click()")
   waitFor("profile editor"){eval("!!document.querySelector('.settings-profile-form input')")=="true"}
   eval("document.querySelector('.settings-profile-form input').value='새 합성 별명'; [...document.querySelectorAll('dialog button')].find(b=>b.textContent==='저장').click()")
   waitFor("native profile saved"){JSONObject(prefs.getString("profile","{}")!!).optString("nickname")=="새 합성 별명"}
   assertEquals("과거 합성 차",contexts.load("synthetic-history.wav")!!.vehicle.nickname)
   val lookup=command("lookupVehicle");assertTrue(lookup.has("values"));assertTrue(lookup.has("notice"))
   // C032: P + consent always exposes the test switch, including real P signal.
   assertTrue((get("modeSwitch") as Button).isShown)
   ui{(get("modeSwitch") as Button).performClick()}
   route("cardriving")
   assertEquals(View.VISIBLE,(get("exact") as View).visibility)
   assertEquals(View.GONE,(get("drivingPanel") as View).visibility)
   assertEquals("0",eval("document.querySelectorAll('[data-live-transcript], [data-review-text], img').length"))
   for(cmd in listOf("getSettings","saveVehicle","lookupVehicle","pairVehicle","renameVehicle","syncSettings","locationSettings","list","read")) assertTrue("blocked while driving: $cmd",command(cmd).has("error"))
   ui{(get("modeSwitch") as Button).performClick()};route("carhome")
   // Enter directly with consent + D and an old selected recording; it must not open review.
   val old=File(dir,"old-selected.wav");old.writeBytes(io.hmg.familydiary.capture.PcmWave.header(32000)+ByteArray(32000))
   ui{set(a!!,"selected",old);(get("driving") as CheckBox).isChecked=true}
   route("cardriving");assertTrue((get("modeSwitch") as Button).isShown)
   ui{(get("modeSwitch") as Button).performClick()};route("carhome")
   // A newly completed capture has a separate pending-review target.
   ui{set(a!!,"pendingCaptureReview",old);(get("driving") as CheckBox).isChecked=true}
   route("cardriving");ui{(get("modeSwitch") as Button).performClick()};route("carreview")
   ui{field(a!!,"pendingCaptureReview").set(a,null)}
   command("settings");route("carsettings")
   // Feed deterministic captured-PCM RMS through the actual native state bridge.
   val pcm=ByteArray(3200);for(n in pcm.indices step 2){val sample=12000;pcm[n]=(sample and 255).toByte();pcm[n+1]=(sample shr 8).toByte()}
   val loud=InputLevel.fromPcm(pcm);val silence=InputLevel.fromPcm(ByteArray(3200));assertTrue(loud>.5f);assertEquals(0f,silence)
   for(mode in listOf("light","dark")){
    theme(mode);ui{set(capture,"busy",true);set(capture,"paused",false);set(a!!,"captureElapsed",8000L);set(a!!,"captureLevel",loud)};emit();route("recording")
    waitFor("wave bound"){eval("document.querySelectorAll('[data-input-wave] > span').length")=="20"}
    waitFor("PCM level reaches waveform"){eval("parseFloat(document.querySelector('[data-input-wave]').lastElementChild.style.height)>35")=="true"}
    assertEquals("\"0:08\"",eval("document.querySelector('[data-timer]').textContent"))
    assertTrue(command("settings").has("error"));assertEquals(false,get("nativeEditor"));route("recording")
    eval("window.__wave=document.querySelector('[data-input-wave]')")
    eval("document.querySelector('[data-theme-cycle]').click()")
    waitFor("theme while recording"){VehicleTheme.mode(i.targetContext)!=mode}
    assertEquals("true",eval("window.__wave===document.querySelector('[data-input-wave]')"));assertTrue(capture.busy)
    ui{set(a!!,"captureLevel",silence)};repeat(20){emit()}
    waitFor("silence"){eval("document.querySelector('[data-input-wave]').lastElementChild.style.height")=="\"4px\""}
    ui{set(capture,"paused",true)};emit()
    waitFor("paused"){eval("document.querySelector('[data-input-wave]')?.getAttribute('aria-label')")=="\"녹음 일시정지\""}
    ui{set(capture,"paused",false);set(a!!,"captureLevel",loud)};emit()
    waitFor("resumed"){eval("parseFloat(document.querySelector('[data-input-wave]').lastElementChild.style.height)>35")=="true"}
   }
  }finally{
   ui{set(capture,"busy",false);set(capture,"paused",false);a?.finish()}
   if(saved==null)prefs.edit().remove("display-theme").commit()else prefs.edit().putString("display-theme",saved).commit()
   if(savedProfile==null)prefs.edit().remove("profile").commit()else prefs.edit().putString("profile",savedProfile).commit()
   Thread.sleep(250);root.deleteRecursively()
  }
 }
}
