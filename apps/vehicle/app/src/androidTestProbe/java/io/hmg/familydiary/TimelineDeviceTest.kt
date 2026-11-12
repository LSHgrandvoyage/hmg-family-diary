package io.hmg.familydiary
import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class TimelineDeviceTest {
 @Test fun knownPcmWindowsMatchBothUtterancesForFileAndLiveInput(){
  val i=InstrumentationRegistry.getInstrumentation()
  val original=i.context.assets.open("synthetic-stt.wav").use{it.readBytes()}.drop(44).toByteArray()
  val pcm=original+ByteArray(64000)+original
  val root=File(i.targetContext.cacheDir,"timeline-qa-${UUID.randomUUID()}").apply{mkdirs()}
  val file=File(root,"synthetic.wav").apply{writeBytes(PcmWave.header(pcm.size.toLong())+pcm)}
  val hash=PcmWave.sha256(file)
  try{
   for(live in listOf(false,true)){
    val done=CountDownLatch(1);val probe=SpeechProbe(i.targetContext);var text="";var status=""
    try{
     i.runOnMainSync{
      if(live)probe.startLive({status=it},{done.countDown()},{text=it})
      else probe.run(file,{status=it},{done.countDown()},{text=it})
     }
     if(live){
      var sent=0
      PcmWave.stream(file){chunk->probe.feed(chunk);sent+=chunk.size;Thread.sleep(chunk.size*1000L/32000);if(sent==32000)Thread.sleep(500)}
      i.runOnMainSync{probe.finishLive()}
     }
     assertTrue("finalize live=$live / $status",done.await(50,TimeUnit.SECONDS))
     assertTrue("final status live=$live / $status",status.startsWith("STT 최종 결과 수신"))
     val rows=probe.segments
     assertEquals("two known utterances live=$live / $status",2,rows.size)
     assertEquals(rows.joinToString("\n"){it.text},text)
     val shift=(original.size+64000)*1000L/32000
     for((n,row) in rows.withIndex()){
      val voiceStart=500L+(if(n==0)0 else shift);val voiceEnd=5900L+(if(n==0)0 else shift)
      assertNotNull(row.startMs);assertNotNull(row.endMs)
      assertTrue("start precedes synthetic speech $n live=$live: $row",row.startMs!!<=voiceStart && voiceStart-row.startMs<1500)
      assertTrue("end contains synthetic speech $n live=$live: $row",row.endMs!!>=voiceEnd && row.endMs-voiceEnd<1500)
     }
     val store=ReviewStore(File(root,"review"));val r=store.load(file).withSpeech(text,rows)
     store.save(r);val saved=store.load(file)
     val timeline=JSONObject(saved.speechTimeline!!)
     assertEquals(2,timeline.getJSONArray("segments").length())
     store.save(saved.edit("사용자가 고친 문장","합성 가족",saved.recordedAt))
     assertEquals(saved.speechTimeline,store.load(file).speechTimeline)
     assertEquals(hash,PcmWave.sha256(file))
     println("C026 live=$live segments=${rows.map{listOf(it.startMs,it.endMs)}} original SHA unchanged")
    }finally{i.runOnMainSync{probe.cancel()}}
    Thread.sleep(500)
   }
  }finally{root.deleteRecursively()}
 }
}
