package io.hmg.familydiary

import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.WaveEnvelope
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class WaveEnvelopeTest {
 @Test fun envelopeFollowsOriginalAmplitudeAndNeverChangesOriginal() {
  val file=File.createTempFile("synthetic-envelope", ".wav")
  try {
   val samples=List(1024){when(it/256){0->0;1->1000;2->16000;else->-16000}}
   val pcm=samples.flatMap{listOf(it.toByte(),(it shr 8).toByte())}.toByteArray()
   file.writeBytes(PcmWave.header(pcm.size.toLong())+pcm)
   val before=PcmWave.sha256(file);val wave=WaveEnvelope.read(file,4)
   assertEquals(0.0,wave[0],0.00001)
   assertTrue(wave[2]>wave[1]);assertEquals(wave[2],wave[3],0.00001)
   assertEquals(16000.0/32768,wave[2],0.00001)
   assertEquals(before,PcmWave.sha256(file))
   assertEquals(128,WaveEnvelope.read(file).size)
  } finally {file.delete()}
 }
}
