package io.hmg.familydiary

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.media.MediaPlayer
import android.os.Bundle
import android.webkit.WebView
import android.widget.CheckBox
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Dedicated contest package only. Host microphone MUST be disabled; fixture is synthesized. */
class ContestReleaseDeviceTest {
    @Test fun signedReleaseRecordsGeneratesPlaysAndSyncs() {
        val i=InstrumentationRegistry.getInstrumentation(); val ctx=i.targetContext
        assertEquals("io.hmg.familydiary.contest",ctx.packageName)
        assertFalse(BuildConfig.DEBUG)
        assertEquals(0,ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE)
        assertTrue(BuildConfig.LOCAL_MOCK)
        assertFalse(File(ctx.filesDir,"diary-probe-token").exists())
        val a=i.startActivitySync(Intent(ctx,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
        fun ui(f:()->Unit)=i.runOnMainSync(f)
        fun get(name:String):Any?=a.javaClass.getDeclaredField(name).apply{isAccessible=true}.get(a)
        fun waitFor(label:String, test:()->Boolean) {val end=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<end){if(test())return;Thread.sleep(100)};fail(label)}
        fun command(name:String,id:String="",extra:JSONObject=JSONObject()):JSONObject {
            val done=CountDownLatch(1);var result=JSONObject()
            ui { a.javaClass.getDeclaredMethod("referenceCommand",JSONObject::class.java,kotlin.jvm.functions.Function1::class.java).apply{isAccessible=true}
                .invoke(a,extra.put("cmd",name).put("memoryId",id),{value:JSONObject->result=value;done.countDown()}) }
            assertTrue("command timeout: $name",done.await(15,TimeUnit.SECONDS));return result
        }
        fun ok(name:String,id:String="",extra:JSONObject=JSONObject()):JSONObject = command(name,id,extra).also{assertFalse("$name: $it",it.has("error"))}
        fun eval(js:String):String {val done=CountDownLatch(1);var result="";ui{(get("exact") as WebView).evaluateJavascript(js){result=it;done.countDown()}};assertTrue(done.await(5,TimeUnit.SECONDS));return result}
        fun screenshot(name:String) {i.uiAutomation.takeScreenshot()?.let { image->File(ctx.cacheDir,name).outputStream().use{image.compress(Bitmap.CompressFormat.PNG,100,it)};image.recycle()}}
        var silent:File?=null
        try {
            waitFor("services bound"){get("recordingService")!=null && get("playbackService")!=null}
            assertTrue("Use fresh contest app data for this new synthetic family account",(get("sync") as CloudSync).vault.isBlank())
            ui {(get("parked") as CheckBox).isChecked=true;(get("consent") as CheckBox).isChecked=true}
            waitFor("home loaded"){eval("!!document.querySelector('[data-mode]') || document.body.innerText.includes('녹음')")=="true"}
            ok("start");Thread.sleep(1500);ok("finish")
            val service=get("recordingService") as RecordingService
            waitFor("real capture stopped"){!service.capture.busy && !service.settling && !service.speech.busy}
            silent=service.resultFile;assertNotNull(silent);assertTrue(PcmWave.payloadBytes(silent!!)>0)
            val silentHash=PcmWave.sha256(silent!!)
            val manual="마이크 입력을 끈 에뮬레이터의 합성 확인문입니다."
            ok("createDiary",silent!!.name,JSONObject().put("text",manual).put("speaker","합성 가족"))
            val store=ReviewStore(File(ctx.filesDir,"capture-review"));val r=store.load(silent!!)
            assertEquals(LocalDiaryMock.TEXT,JSONObject(r.draft!!).getJSONArray("groups").getJSONObject(0).getJSONArray("statements").getJSONObject(0).getString("text"))
            ok("saveDiary",silent!!.name,JSONObject().put("revision",r.revision).put("text",r.text).put("speaker",r.speaker))
            assertEquals(silentHash,PcmWave.sha256(silent!!))
            // Actual public STT SDK, same known synthesized source; no host audio.
            val file=File(ctx.filesDir,"capture-probe/${UUID.randomUUID()}.wav")
            file.writeBytes(i.context.assets.open("synthetic-stt.wav").use{it.readBytes()})
            val hash=PcmWave.sha256(file);val done=CountDownLatch(1);var status=""
            val speech=SpeechProbe(ctx)
            ui {speech.run(file,onStatus={status=it},onDone={done.countDown()})}
            assertTrue("SDK STT timeout",done.await(60,TimeUnit.SECONDS))
            assertTrue("SDK not finalized: $status",status.startsWith("STT 최종 결과 수신"))
            assertTrue("empty SDK text",status.substringAfter('\n',"").isNotBlank())
            store.save(store.load(file).withSpeech(status.substringAfter('\n'),speech.segments))
            ui{speech.cancel()}
            val raw=store.load(file).text
            ok("read",file.name)
            ok("createDiary",file.name,JSONObject().put("text",raw).put("speaker","합성 가족"))
            val generated=store.load(file)
            assertEquals(raw,generated.text)
            assertEquals(hash,PcmWave.sha256(file))
            ok("saveDiary",file.name,JSONObject().put("revision",generated.revision).put("text",raw).put("speaker",generated.speaker))
            ok("play",file.name)
            waitFor("original playback progressed"){(get("player") as? MediaPlayer)?.let{runCatching{it.currentPosition>150}.getOrDefault(false)}==true}
            ok("stopPlayback")
            ok("tts",file.name)
            val playback=get("playbackService") as PlaybackService
            waitFor("TTS playback started"){playback.narrating}
            Thread.sleep(500);ok("stopPlayback");waitFor("TTS stopped"){!playback.busy}
            ui{(get("driving") as CheckBox).isChecked=true}
            assertTrue(command("read",file.name).has("error"))
            assertTrue(command("importServerSettings").has("error"))
            ui{(get("parked") as CheckBox).isChecked=true}
            ok("view",extra=JSONObject().put("page","carsettings"))
            ui{(get("exact") as ExactDiaryView).settings()}
            waitFor("release settings import action"){eval("!!document.querySelector('[data-server-import]:not([hidden])')")=="true"}
            screenshot("release-settings.png")
            val code=InstrumentationRegistry.getArguments().getString("pairCode")
            if(code!=null) {
                assertTrue("User-imported server config required",ServerSettings.configured(ctx.filesDir))
                ok("pairVehicle",extra=JSONObject().put("code",code))
                val sync=get("sync") as CloudSync
                waitFor("completed diaries automatically uploaded"){sync.uploaded(file.name) && sync.uploaded(silent!!.name)}
                i.sendStatus(0,Bundle().apply{putString("stream","\nC035_RESULT="+JSONObject().put("device",sync.device).put("file",file.name).put("sha256",hash).put("text",raw).toString()+"\n")})
            }
            assertEquals(hash,PcmWave.sha256(file))
        } finally {ui {a.finish()}}
    }

    @Test fun localMockAndSettingsRejectStaleOrInvalidInputs() {
        val i=InstrumentationRegistry.getInstrumentation();val ctx=i.targetContext
        val r=ReviewRecord("synthetic.wav","fakehash",1000,"2099-11-12T00:00:00Z").edit("합성 이야기","합성 가족","2099-11-12T00:00:00Z").confirm()
        val input=r.input();val before=input.toString();val result=LocalDiaryMock.generate(input)
        assertEquals(before,input.toString());assertEquals(r.revision,result.getInt("input_revision"))
        assertEquals(1,result.getJSONObject("draft").getJSONArray("groups").length())
        assertTrue(runCatching{r.edit("수정된 이야기",r.speaker,r.recordedAt).confirm().adopt(result)}.isFailure)
        val generator=DiaryProbe(ctx);var called=false
        i.runOnMainSync {generator.run(input){_,_->called=true};generator.cancel()}
        i.waitForIdleSync();assertFalse(called)
        assertTrue(runCatching{ServerSettings.parse(ByteArray(32769))}.isFailure)
        assertTrue(runCatching{ServerSettings.parse("{}".toByteArray())}.isFailure)
        if(ServerSettings.configured(ctx.filesDir)) {
            val original=ServerSettings.read(ctx.filesDir)
            for(value in listOf("http://example.test","https://a:b@example.test","https://example.test/path","https://example.test#fragment"))
                assertTrue(runCatching{ServerSettings.parse(original.json().put("origin",value).toString().toByteArray())}.isFailure)
            assertTrue(runCatching{ServerSettings.parse(original.json().put("token","not-allowed").toString().toByteArray())}.isFailure)
            assertEquals(original.fingerprint,ServerSettings.parse(original.json().toString().toByteArray()).fingerprint)
            val root=File(ctx.cacheDir,"trust-${UUID.randomUUID()}").apply{mkdirs()}
            try {
                original.save(root,false)
                val system=java.security.KeyStore.getInstance("AndroidCAStore").apply{load(null)}
                val different=system.aliases().asSequence().map{system.getCertificate(it)}.first{!it.encoded.contentEquals(original.certificate.encoded)}
                val pem="-----BEGIN CERTIFICATE-----\n"+android.util.Base64.encodeToString(different.encoded,android.util.Base64.NO_WRAP)+"\n-----END CERTIFICATE-----\n"
                assertTrue(runCatching{ServerSettings(original.origin,pem).save(root,true)}.isFailure)
                assertEquals(original.fingerprint,ServerSettings.read(root).fingerprint)
                val moved=ServerSettings("https://192.168.0.99:18443",original.pem)
                moved.save(root,true);assertEquals(moved.origin,ServerSettings.read(root).origin)
            }finally{root.deleteRecursively()}

        }
    }
}
