package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Real HTTPS round trip, exclusively host-created synthetic fixture directories and vault. */
class TimelineSyncDeviceTest {
    private val i=InstrumentationRegistry.getInstrumentation()
    private val root=File(i.targetContext.filesDir,"timeline-sync-qa")
    private val recordings=File(root,"capture-probe").apply{mkdirs()}
    private val reviews=ReviewStore(File(root,"capture-review"))
    private val contexts=MemoryContextStore(File(root,"memory-context"))
    private val original get()=File(recordings,File(root,"recording-name.txt").readText().trim())
    private fun client()=CloudSync(root,recordings,reviews,contexts).apply{begin()}

    @Test fun recognizeOriginal(){
        val pcm=i.context.assets.open("synthetic-stt.wav").use{it.readBytes()}.drop(44).toByteArray()
        val data=pcm+ByteArray(64000)+pcm
        original.writeBytes(PcmWave.header(data.size.toLong())+data)
        val before=PcmWave.sha256(original)
        val probe=SpeechProbe(i.targetContext);val done=CountDownLatch(1);var text=""
        try {
            i.runOnMainSync{probe.run(original,{}, {done.countDown()}, {text=it})}
            assertTrue(done.await(50,TimeUnit.SECONDS));assertEquals(2,probe.segments.size)
            assertTrue(probe.segments.all{it.startMs!=null && it.endMs!=null})
            val r=reviews.load(original).withSpeech(text,probe.segments)
                .edit("합성 타임라인 동기화 확인문","합성 가족","2099-11-11T12:00:00Z").confirm()
            reviews.save(r)
            File(root,"input.json").writeText(r.input().toString())
            File(root,"expected.json").writeText(reviews.snapshot(r).toString())
            assertEquals(before,PcmWave.sha256(original))
        } finally {i.runOnMainSync{probe.cancel()}}
    }

    @Test fun completeAndAutoUpload(){
        val fixture=JSONObject(File(root,"fixture.json").readText())
        val s=client();s.pair(fixture.getString("code"),"타임라인 합성 시험 차량")
        assertTrue(s.outbox.jobs(s.vault,s.device).isEmpty()) // Unaccepted review never uploads.
        val r=reviews.load(original).adopt(fixture.getJSONObject("generated"))
        reviews.save(r.copy(accepted=r.revision));s.capture(original)
        val job=s.outbox.jobs(s.vault,s.device).single()
        File(root,"result.json").writeText(JSONObject().put("id",job.getString("id")).put("device",s.device).toString())
        s.flush() // Same outbox transport as save/background flow, no per-diary share call.
        assertTrue(s.uploadNotice,s.outbox.jobs(s.vault,s.device).isEmpty())
        assertEquals("shared",s.shareStatus(original.name,r.revision))
    }

    @Test fun receivePhotoAndColdRestore(){
        val expected=JSONObject(File(root,"expected.json").readText())
        fun checkRecord(file:File,store:ReviewStore,media:MemoryContextStore){
            val r=store.load(file)
            assertEquals(expected.getString("sha256"),PcmWave.sha256(file))
            assertEquals(expected.getString("text"),r.text)
            assertEquals(expected.getJSONArray("raw_history").toString(),org.json.JSONArray(r.rawHistory).toString())
            // PostgreSQL JSONB reorders object keys; compare every key/value and array order.
            val wanted=expected.getJSONObject("speech_timeline");val actual=JSONObject(r.speechTimeline!!)
            assertEquals(wanted.keys().asSequence().toSet(),actual.keys().asSequence().toSet())
            assertEquals(wanted.getString("source"),actual.getString("source"))
            assertEquals(wanted.getInt("raw_history_index"),actual.getInt("raw_history_index"))
            val wantedRows=wanted.getJSONArray("segments");val actualRows=actual.getJSONArray("segments")
            assertEquals(wantedRows.length(),actualRows.length())
            for(n in 0 until wantedRows.length()){
                val w=wantedRows.getJSONObject(n);val a=actualRows.getJSONObject(n)
                assertEquals(w.keys().asSequence().toSet(),a.keys().asSequence().toSet())
                w.keys().asSequence().forEach{k->assertEquals("segment $n / $k",w.get(k),a.get(k))}
            }
            assertEquals(1,media.photos(file.name).size)
        }
        client().pull();checkRecord(original,reviews,contexts)
        val restored=File(root,"receiver").apply{mkdirs()}
        for(n in listOf("sync-origin.txt","sync-ca.crt"))File(root,n).copyTo(File(restored,n),overwrite=true)
        val state=JSONObject(File(root,"cloud-sync.json").readText()).put("links",JSONObject()).put("cursor","0")
        File(restored,"cloud-sync.json").writeText(state.toString())
        val files=File(restored,"capture-probe").apply{mkdirs()}
        val store=ReviewStore(File(restored,"capture-review"));val media=MemoryContextStore(File(restored,"memory-context"))
        CloudSync(restored,files,store,media).apply{begin();pull()}
        val id=JSONObject(File(root,"result.json").readText()).getString("id")
        checkRecord(File(files,"$id.wav"),store,media)
    }
}
