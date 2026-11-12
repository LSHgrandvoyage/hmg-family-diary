package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Only the dedicated name-sync-qa directory and synthetic diary. No microphone. */
class VehicleNameSyncDeviceTest {
 private val i get()=InstrumentationRegistry.getInstrumentation()
 private val root get()=File(i.targetContext.filesDir,"name-sync-qa")
 private val dir get()=File(root,"capture-probe").apply{mkdirs()}
 private val store get()=ReviewStore(File(root,"capture-review"))
 private val contexts get()=MemoryContextStore(File(root,"memory-context"))
 private val filename get()=JSONObject(File(root,"fixture.json").readText()).getString("filename")
 private fun client()=CloudSync(root,dir,store,contexts).apply{begin()}
 @Test fun migrateOfflineAndReplayLatestNameWithoutRewritingHistory(){
  val file=File(dir,filename);file.writeBytes(PcmWave.header(32000)+ByteArray(32000))
  val review=store.load(file).edit("합성 별명 검증용 기록입니다.","합성 가족","2099-11-12T11:00:00Z").confirm()
  val span=JSONObject().put("utterance_id","original").put("start_ms",0).put("end_ms",review.durationMs)
  val statement=JSONObject().put("text",review.text).put("audience","member").put("member_id","speaker").put("source_spans",JSONArray().put(span))
  val group=JSONObject().put("id","mock-1").put("label","합성 별명 기록").put("place_label",JSONObject.NULL).put("date",JSONObject.NULL).put("time_relation","unclear").put("needs_review",false).put("statements",JSONArray().put(statement))
  val draft=JSONObject().put("schema_version","1").put("groups",JSONArray().put(group)).put("excluded_spans",JSONArray()).put("review_items",JSONArray())
  store.save(review.copy(draft=draft.toString(),draftRevision=review.revision,accepted=review.revision,generationMode="mock",model="mock-confirmed-text-v1",promptVersion="mock-passthrough-v1"))
  contexts.create(file.name,MemoryContext("2099-11-12T11:00:00Z",VehicleSnapshot("과거 합성 차")))
  var sync=client();sync.pair(JSONObject(File(root,"fixture.json").readText()).getString("code"),"기존 연결 이름")
  // Explicit pre-migration fixture, never modifies the app's real connection.
  val stateFile=File(root,"cloud-sync.json");val old=JSONObject(stateFile.readText());old.remove("name_unified");stateFile.writeText(old.toString())
  sync=client();assertFalse(sync.nameUnified);sync.adoptVehicleName("기존 차 별명");assertTrue(sync.namePending)
  sync=client();assertEquals("기존 차 별명",sync.deviceLabel);assertTrue(sync.nameUnified)
  val origin=File(root,"sync-origin.txt");val originalOrigin=origin.readText()
  try {origin.writeText("https://127.0.0.1:1");sync.flush();assertTrue(sync.namePending);assertNotNull(sync.retryDelay())}
  finally {origin.writeText(originalOrigin)}
  sync=client();assertEquals("기존 차 별명",sync.deviceLabel)
  sync.queueVehicleName("합성 현재 차");sync.retryNow();sync.flush();sync.pull()
  assertFalse(sync.namePending);assertEquals("합성 현재 차",sync.deviceLabel)
  assertEquals("과거 합성 차",contexts.load(file.name)!!.vehicle.nickname)
  try {sync.queueVehicleName("x".repeat(41));fail("long name accepted")}catch(_:IllegalArgumentException){}
  val links=JSONObject(stateFile.readText()).getJSONObject("links")
  val id=links.keys().asSequence().first{links.getJSONObject(it).getString("file")==file.name}
  assertTrue("synthetic diary uploaded",links.getJSONObject(id).optBoolean("audio_ready"))
  File(root,"result.json").writeText(JSONObject().put("device",sync.device).put("id",id).toString())
 }
 @Test fun receivePhoneNameThroughEvents(){
  val sync=client();val seen=CountDownLatch(1);val ready=CountDownLatch(1)
  val events=SyncEvents(i.targetContext,{sync},{
   Thread {
    runCatching{sync.pull()}.onSuccess {
     if(sync.deviceLabel=="휴대폰에서 바꾼 차")seen.countDown() else ready.countDown()
    }
   }.start()
  },{})
  i.runOnMainSync{events.start()}
  try {
   assertTrue(ready.await(15,TimeUnit.SECONDS))
   val limit=System.currentTimeMillis()+15000
   while(events.eventsReceived<1 && System.currentTimeMillis()<limit)Thread.sleep(60)
   assertTrue(events.eventsReceived>=1)
   // Drain the initial ready read before the caller changes the phone's name.
   sync.pull();File(root,"ready.flag").writeText("ready")
   assertTrue("phone label change received",seen.await(25,TimeUnit.SECONDS))
   assertTrue("ready plus actual changed event",events.eventsReceived>=2)
   assertEquals("휴대폰에서 바꾼 차",client().deviceLabel)
   assertEquals("과거 합성 차",contexts.load(filename)!!.vehicle.nickname)
  } finally {i.runOnMainSync{events.stop()}}
 }
 @Test fun uploadNameWhilePhoneIsOpen(){
  val sync=client();sync.queueVehicleName("차량에서 바꾼 차");sync.flush();sync.pull()
  assertEquals("차량에서 바꾼 차",sync.deviceLabel);assertFalse(sync.namePending)
  assertEquals("과거 합성 차",contexts.load(filename)!!.vehicle.nickname)
 }
}
