package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID

class SyncRecoveryDeviceTest {
 @Test fun pendingAudioReceivesPhotosAndRetriesWithoutChangingOriginal() {
  val root=File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir,"c038-${UUID.randomUUID()}").apply{mkdirs()}
  try {
   val vault=UUID.randomUUID().toString();val device=UUID.randomUUID().toString();val id=UUID.randomUUID().toString()
   val dir=File(root,"capture-probe").apply{mkdirs()};val f=File(dir,"synthetic.wav")
   f.writeBytes(PcmWave.header(64064)+ByteArray(64064));val sha=PcmWave.sha256(f)
   val reviews=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
   val initial=reviews.load(f);assertEquals(2002L,initial.durationMs)
   val snapshot=reviews.snapshot(initial).put("context",JSONObject.NULL)
   val link=JSONObject().put("file",f.name).put("revision",1).put("input_revision",0).put("photos",JSONArray()).put("audio_ready",false)
   File(root,"cloud-sync.json").writeText(JSONObject().put("vault",vault).put("device",device).put("token","a".repeat(64)).put("cursor","0").put("links",JSONObject().put(id,link)).toString())
   val sync=CloudSync(root,dir,reviews,contexts);sync.outbox.bind(f.name,vault)
   sync.outbox.enqueue(f.name,vault,device,id,snapshot,link)
   val job=sync.outbox.jobs(vault,device).single().put("stage","audio").put("blocked",true).put("error","기록을 전송하지 못했어요. 내용을 확인해 주세요.")
   sync.outbox.update(job)
   val photoId=UUID.randomUUID().toString();val photo=File(root,"memory-context/${f.name}/$photoId.jpg").apply{parentFile.mkdirs();writeBytes(byteArrayOf(1,2,3))}
   val item=JSONObject().put("id",id).put("deleted",false).put("audio_ready",false).put("revision",2).put("snapshot",snapshot)
    .put("photos",JSONArray().put(JSONObject().put("id",photoId).put("sha256",PcmWave.sha256(photo))))
   val apply=CloudSync::class.java.getDeclaredMethod("apply",JSONObject::class.java).apply{isAccessible=true}
   assertEquals(0L,sync.changeSequence)
   apply.invoke(sync,item)
   assertEquals(1L,sync.changeSequence)
   apply.invoke(sync,item)
   assertEquals("Same replay does not announce another saved record",1L,sync.changeSequence)
   assertEquals(listOf(photo.name),contexts.photos(f.name).map{it.name});assertFalse(sync.uploaded(f.name))
   assertEquals(sha,PcmWave.sha256(f));assertEquals(initial,reviews.load(f))
   assertTrue(sync.outbox.retryAudioValidation(vault,device,true))
   assertFalse(sync.outbox.jobs(vault,device).single().optBoolean("blocked"))
   val again=sync.outbox.jobs(vault,device).single().put("blocked",true).put("error_code","AUDIO_MISMATCH")
   sync.outbox.update(again);assertFalse(sync.outbox.retryAudioValidation(vault,device,true))
   sync.retryNow();assertFalse(sync.outbox.jobs(vault,device).single().optBoolean("blocked"))
   val conflict=sync.outbox.jobs(vault,device).single().put("stage","snapshot").put("blocked",true)
   sync.outbox.update(conflict);sync.retryNow();assertTrue(sync.outbox.jobs(vault,device).single().optBoolean("blocked"))
   sync.outbox.delete(f.name,vault,device,id);sync.retryNow();assertTrue(sync.outbox.jobs(vault,device).single().optBoolean("delete"))
   assertEquals(sha,PcmWave.sha256(f))
   val deleted=JSONObject().put("id",id).put("deleted",true)
   apply.invoke(sync,deleted);assertEquals(2L,sync.changeSequence)
   apply.invoke(sync,deleted);assertEquals(2L,sync.changeSequence)
  } finally {root.deleteRecursively()}
 }
 @Test fun revisedDiaryAnnouncesOnlyAnActualContentChange() {
  val root=File(InstrumentationRegistry.getInstrumentation().targetContext.cacheDir,"c048-${UUID.randomUUID()}").apply{mkdirs()}
  try {
   val vault=UUID.randomUUID().toString();val device=UUID.randomUUID().toString();val id=UUID.randomUUID().toString()
   val dir=File(root,"capture-probe").apply{mkdirs()};val f=File(dir,"synthetic.wav")
   f.writeBytes(PcmWave.header(64000)+ByteArray(64000))
   val reviews=ReviewStore(File(root,"capture-review"));val contexts=MemoryContextStore(File(root,"memory-context"))
   var original=reviews.load(f).edit("합성 이야기","합성 가족","2099-11-14T00:00:00Z").confirm()
   original=original.adopt(LocalDiaryMock.generate(original.input())).copy(accepted=original.revision);reviews.save(original)
   val snapshot=reviews.snapshot(original).put("context",JSONObject.NULL)
   val link=JSONObject().put("file",f.name).put("revision",1).put("input_revision",original.revision).put("photos",JSONArray()).put("audio_ready",true).put("snapshot",snapshot)
   File(root,"cloud-sync.json").writeText(JSONObject().put("vault",vault).put("device",device).put("token","a".repeat(64)).put("cursor","0").put("links",JSONObject().put(id,link)).toString())
   val sync=CloudSync(root,dir,reviews,contexts)
   val apply=CloudSync::class.java.getDeclaredMethod("apply",JSONObject::class.java).apply{isAccessible=true}
   val item=JSONObject().put("id",id).put("deleted",false).put("audio_ready",true).put("revision",1).put("snapshot",snapshot).put("photos",JSONArray())
   apply.invoke(sync,item);assertEquals(0L,sync.changeSequence);assertEquals(original,reviews.load(f))
   val updated=original.renameTitle("동기화로 바뀐 합성 제목")
   item.put("revision",2).put("snapshot",reviews.snapshot(updated).put("context",JSONObject.NULL))
   apply.invoke(sync,item);assertEquals(1L,sync.changeSequence);assertEquals(updated,reviews.load(f))
   // A server metadata revision and JSON key order change are not a new diary.
   val reordered=JSONObject();val draft=JSONObject(updated.draft!!)
   draft.keys().asSequence().toList().reversed().forEach{reordered.put(it,draft.get(it))}
   item.put("revision",3).getJSONObject("snapshot").put("draft",reordered.toString())
   apply.invoke(sync,item);assertEquals(1L,sync.changeSequence);assertEquals(updated,reviews.load(f))
   assertEquals(original.sha256,PcmWave.sha256(f))
  } finally {root.deleteRecursively()}
 }

}
