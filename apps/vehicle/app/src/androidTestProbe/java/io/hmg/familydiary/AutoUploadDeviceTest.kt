package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

/** Host orchestrates real HTTPS failures, photo races, response loss and process restarts. Synthetic only. */
class AutoUploadDeviceTest {
    private val root=File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir,"upload-qa")
    private val recordings=File(root,"capture-probe").apply { mkdirs() }
    private val reviews=ReviewStore(File(root,"capture-review"))
    private val contexts=MemoryContextStore(File(root,"memory-context"))
    private val fixture get()=JSONObject(File(root,"fixture.json").readText())
    private fun client()=CloudSync(root,recordings,reviews,contexts).apply { begin() }
    private fun name(value:String):String=fixture.getString("prefix").let { if(value.startsWith(it))value else it+value }
    private fun original(filename:String="complete.wav")=File(recordings,name(filename))
    private fun create(filename:String,accepted:Boolean=true):File {
        val file=original(filename);file.writeBytes(File(root,"fixture.wav").readBytes());val s=fixture.getJSONObject("snapshot")
        reviews.save(ReviewRecord(file.name,s.getString("sha256"),s.getLong("duration_ms"),s.getString("recorded_at"),
            listOf(s.getString("text")),s.getString("text"),s.getString("speaker"),1,1,s.getString("draft"),1,if(accepted)1 else -1,s.getString("model"),s.getString("prompt_version"),"mock"))
        return file
    }
    private fun publish(client:CloudSync,filename:String="complete.wav") {
        val job=client.outbox.jobs(client.vault,client.device).first { it.getString("file")==name(filename) }
        File(root,"job.json").writeText(job.toString())
    }
    @Test fun prepareOfflineAndExcludeDraft() {
        val s=client();val complete=create("complete.wav");create("draft.wav",false)
        s.pair(fixture.getString("code"),"자동 업로드 합성 검사")
        // First pairing adopts already completed unowned records; drafts remain local.
        val origin=File(root,"sync-origin.txt");val valid=origin.readText()
        try { origin.writeText("https://127.0.0.1:1");s.flush() } finally { origin.writeText(valid) }
        assertEquals("pending",s.shareStatus(complete.name,1))
        val jobs=s.outbox.jobs(s.vault,s.device)
        assertEquals(1,jobs.size);assertEquals(name("complete.wav"),jobs.single().getString("file"))
        assertTrue(jobs.single().getLong("next_at")>System.currentTimeMillis())
        assertTrue(complete.exists());publish(s)
    }
    @Test fun recoverAfterRestart() {
        val s=client();val before=JSONObject(File(root,"job.json").readText());val queued=s.outbox.jobs(s.vault,s.device).single()
        assertEquals(before.getString("request_key"),queued.getString("request_key"))
        s.retryNow();s.flush()
        assertEquals("shared",s.shareStatus(name("complete.wav"),reviews.load(original()).revision))
        assertTrue(s.outbox.jobs(s.vault,s.device).isEmpty())
        assertEquals(-1,reviews.load(original("draft.wav")).accepted)
    }
    @Test fun queueReconfirmation() {
        val s=client();val file=original();val r=reviews.load(file);val next=r.revision+1
        reviews.save(r.copy(revision=next,confirmed=next,accepted=next,draftRevision=next))
        s.capture(file);publish(s)
    }
    @Test fun recoverReconfirmation() {
        val s=client();s.retryNow();s.flush()
        assertEquals("shared",s.shareStatus(name("complete.wav"),reviews.load(original()).revision))
        assertTrue(s.outbox.jobs(s.vault,s.device).isEmpty())
    }
    @Test fun deleteOfflineWinsAfterRestart() {
        val s=client();val r=reviews.load(original());val next=r.revision+1
        reviews.save(r.copy(revision=next,confirmed=next,accepted=next,draftRevision=next));s.capture(original())
        s.delete(original());assertFalse(original().exists())
        assertTrue(s.outbox.jobs(s.vault,s.device).single().getBoolean("delete"))
        val restarted=client();restarted.flush();assertTrue(restarted.outbox.jobs(s.vault,s.device).isEmpty())
        restarted.pull();assertFalse(original().exists());assertTrue(restarted.outbox.deleted(name("complete.wav")))
    }
    @Test fun prepareRemoteDelete() {
        val s=client();val f=create("remote.wav");s.capture(f);publish(s,f.name);s.flush()
        assertEquals("shared",s.shareStatus(f.name,1))
        val r=reviews.load(f);reviews.save(r.copy(revision=2,confirmed=2,accepted=2,draftRevision=2));s.capture(f)
    }
    @Test fun remoteDeletionDoesNotResurrectOrInterruptMedia() {
        val s=client();s.flush();assertTrue(original("remote.wav").exists()) // background never deletes playing media
        assertTrue(s.outbox.deleted(name("remote.wav")));s.pull();assertFalse(original("remote.wav").exists())
    }
    @Test fun prepareRevocation() {
        val s=client();val f=create("revoked.wav");s.capture(f);publish(s,f.name)
    }
    @Test fun prepareContentConflict() {
        val s=client();val f=create("conflict.wav");s.capture(f);publish(s,f.name);s.flush()
        val r=reviews.load(f);reviews.save(r.copy(revision=2,confirmed=2,accepted=2,draftRevision=2));s.capture(f)
    }
    @Test fun scheduledJobUploadsWithoutActivity() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val s=client();val file=create("background.wav") // No capture(): scheduled startup reconciliation repairs missing outbox.
        @Suppress("UNCHECKED_CAST")
        val instances=CloudSync::class.java.getDeclaredField("instances").apply { isAccessible=true }.get(null) as java.util.concurrent.ConcurrentHashMap<String,CloudSync>
        val key=context.filesDir.canonicalPath;val previous=instances.put(key,s)
        val scheduler=context.getSystemService(android.app.job.JobScheduler::class.java)
        try {
            SyncUploads.schedule(context,1000)
            val job=requireNotNull(scheduler.getPendingJob(2301))
            assertNotNull(job);assertTrue(job.isPersisted);assertEquals(android.app.job.JobInfo.NETWORK_TYPE_ANY,job.networkType)
            val until=System.currentTimeMillis()+45000
            while(System.currentTimeMillis()<until && (s.shareStatus(file.name,1)!="shared" || scheduler.getPendingJob(2301)!=null))Thread.sleep(100)
            assertEquals("shared",s.shareStatus(file.name,1));assertNull(scheduler.getPendingJob(2301))
            File(root,"background-id.json").writeText(JSONObject().put("id",java.util.UUID.nameUUIDFromBytes((s.vault+":"+file.name).toByteArray()).toString()).toString())
        } finally {
            scheduler.cancel(2301)
            if(previous==null)instances.remove(key) else { instances[key]=previous;SyncUploads.request(context,previous) }
        }
    }
    @Test fun preserveContentConflict() {
        val s=client();s.flush();assertEquals("conflict",s.shareStatus(name("conflict.wav"),2))
        s.pull();assertEquals(2,reviews.load(original("conflict.wav")).revision)
        assertTrue(s.outbox.jobs(s.vault,s.device).first { it.getString("file")==name("conflict.wav") }.getBoolean("blocked"))
    }
    @Test fun saveButtonAutomaticallyUploads() {
        val s=client();val file=create("ui-complete.wav",false)
        val i=InstrumentationRegistry.getInstrumentation();var activity:MainActivity?=null
        fun ui(fn:()->Unit)=i.runOnMainSync(fn)
        fun views(v:android.view.View):List<android.view.View> = listOf(v)+if(v is android.view.ViewGroup)(0 until v.childCount).flatMap { views(v.getChildAt(it)) } else emptyList()
        fun set(name:String,value:Any){activity!!.javaClass.getDeclaredField(name).apply { isAccessible=true }.set(activity,value)}
        fun eval(js:String):String {
            val latch=java.util.concurrent.CountDownLatch(1);var value=""
            ui { views(activity!!.window.decorView).filterIsInstance<android.webkit.WebView>().first().evaluateJavascript(js){value=it;latch.countDown()} }
            assertTrue(latch.await(5,java.util.concurrent.TimeUnit.SECONDS));return value
        }
        fun waitFor(label:String,predicate:()->Boolean){val until=System.currentTimeMillis()+30000;while(System.currentTimeMillis()<until){if(predicate())return;Thread.sleep(100)};fail(label+" / "+eval("JSON.stringify({page:document.querySelector('[data-page]')?.dataset.page,save:document.querySelector('[data-save]')?.hidden,ready:document.readyState})"))}
        try {
            activity=i.startActivitySync(android.content.Intent(i.targetContext,MainActivity::class.java).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) as MainActivity
            waitFor("services ready") { activity!!.javaClass.getDeclaredField("recordingService").apply { isAccessible=true }.get(activity)!=null }
            waitFor("initial receive finished") { !activity!!.javaClass.getDeclaredField("syncBusy").apply { isAccessible=true }.getBoolean(activity) }
            ui {
                (activity!!.javaClass.getDeclaredMethod("getSyncEvents").apply { isAccessible=true }.invoke(activity) as SyncEvents).stop()
                set("sync",s);set("directory",recordings);set("store",reviews);set("contexts",contexts);set("syncPending",false);set("nextAutoPull",Long.MAX_VALUE);set("syncVersion",s.version)
                val panel=activity!!.javaClass.getDeclaredField("review").apply { isAccessible=true }.get(activity)
                panel.javaClass.getDeclaredField("store").apply { isAccessible=true }.set(panel,reviews)
                activity!!.gateTestControls().take(2).forEach { it.isChecked=true }
            }
            waitFor("review bridge") { eval("typeof openNativeReview==='function'")=="true" }
            waitFor("initial home rendered") { eval("!!document.querySelector('[data-page=carhome], [data-page=carlist]')")=="true" }
            eval("openNativeReview(${JSONObject.quote(name("ui-complete.wav"))})")
            waitFor("save available") { eval("document.querySelector('[data-save]')?.hidden===false")=="true" }
            eval("document.querySelector('[data-save]').click()")
            waitFor("final save automatically uploads without share/flush") { s.shareStatus(file.name,1)=="shared" }
            assertEquals(1,reviews.load(file).accepted)
            File(root,"ui-id.json").writeText(JSONObject().put("id",java.util.UUID.nameUUIDFromBytes((s.vault+":"+file.name).toByteArray()).toString()).toString())
        } finally {ui { activity?.finish() }}
    }
    @Test fun revokedIdentityStopsRetry() {
        val s=client();s.flush();assertFalse(s.paired);assertNull(s.retryDelay());assertTrue(original("revoked.wav").exists())
        val old=s.vault;s.cleanupRevoked();assertFalse(s.paired)
        assertEquals(old,s.outbox.owner(name("revoked.wav")))
        assertFalse(s.outbox.bind(name("revoked.wav"),"different-family-vault"))
        s.outbox.enqueue(name("revoked.wav"),"different-family-vault","other-device","other-id",fixture.getJSONObject("snapshot"))
        assertTrue(s.outbox.jobs("different-family-vault","other-device").isEmpty())
    }
}
