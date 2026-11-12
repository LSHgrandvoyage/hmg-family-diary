package io.hmg.familydiary
import io.hmg.familydiary.capture.SpeechAlignment
import org.junit.Assert.*
import org.junit.Test
class SpeechAlignmentTest {
 @Test fun explicitSampleOriginIncludesPauseFreePcmOnly(){
  val row=SpeechAlignment.first("둘째 말",192000,128000,320000,329600)
  assertEquals(10000L,row.startMs);assertEquals(16000L,row.endMs)
 }
 @Test fun invalidOffsetsNeverInventSeekTargets(){
  for((on,off) in listOf(-1L to 100L,100L to 50L,0L to 32002L,1L to 32000L,0L to 0L)){
   val row=SpeechAlignment.first("말",0,on,off,32000);assertNull(row.startMs);assertNull(row.endMs);assertEquals("말",row.text)
  }
 }
}
