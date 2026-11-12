package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/** Dedicated synthetic directory; never enumerates or exports the user's existing records. */
class CloudSyncDeviceTest {
    private val root get() = File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir,"sync-qa")
    private val recordings get() = File(root,"capture-probe").apply{mkdirs()}
    private val store get()=ReviewStore(File(root,"capture-review"))
    private val contexts get()=MemoryContextStore(File(root,"memory-context"))
    private fun sync()=CloudSync(root,recordings,store,contexts).apply{begin()}
    private fun fixture()=JSONObject(File(root,"fixture.json").readText())
    @Test fun pairUploadAndReadOriginal(){
        val f=fixture();val s=f.getJSONObject("snapshot");val original=File(recordings,"synthetic-cloud.wav")
        original.writeBytes(File(root,"fixture.wav").readBytes())
        store.save(ReviewRecord(original.name,s.getString("sha256"),s.getLong("duration_ms"),s.getString("recorded_at"),listOf(s.getString("text")),s.getString("text"),s.getString("speaker"),1,1,s.getString("draft"),1,1,s.getString("model"),s.getString("prompt_version"),"mock"))
        contexts.create(original.name,MemoryContext(s.getString("recorded_at"),VehicleSnapshot("합성 차량","현대","시험 모델","SUV","2026","","synthetic"),true))
        val client=sync();client.pair(f.getString("code"), "합성 연결 별칭");client.rename("차량에서 바꾼 시험 별칭");client.pull();assertEquals("차량에서 바꾼 시험 별칭", client.deviceLabel);client.share(original)
        assertTrue(client.linked(original.name));assertEquals(s.getString("sha256"),io.hmg.familydiary.capture.PcmWave.sha256(original))
        // Existing server record also downloads into this isolated directory with the identical SHA.
        assertTrue(recordings.listFiles()!!.size>=2)
        for(file in recordings.listFiles()!!)assertEquals(s.getString("sha256"),io.hmg.familydiary.capture.PcmWave.sha256(file))
    }
    @Test fun receivePhonePhoto(){
        sync().pull();assertTrue(contexts.photos("synthetic-cloud.wav").isNotEmpty())
        val pixels=android.graphics.BitmapFactory.decodeFile(contexts.photos("synthetic-cloud.wav").first().path)
        assertNotNull(pixels);pixels.recycle()
    }
    @Test fun receiveRemoteDeletion(){
        sync().pull();assertFalse(File(recordings,"synthetic-cloud.wav").exists());assertTrue(contexts.photos("synthetic-cloud.wav").isEmpty())
    }
    @Test fun revocationPurgesOnlySharedCopies(){
        val local=File(recordings,"never-shared.wav").apply{writeBytes(File(root,"fixture.wav").readBytes())}
        try{sync().pull();fail("revoked access accepted")}catch(_:IllegalStateException){}
        assertTrue(local.exists());assertFalse(sync().paired)
        assertEquals(listOf("never-shared.wav"),recordings.listFiles()!!.map{it.name})
        local.delete()
    }
}
