package io.hmg.familydiary

import io.hmg.familydiary.capture.InputLevel
import org.junit.Assert.*
import org.junit.Test

class InputLevelTest {
    private fun pcm(vararg samples: Int) = samples.flatMap { listOf(it.toByte(), (it shr 8).toByte()) }.toByteArray()
    @Test fun silenceAndNoiseFloorStayFlat() {
        assertEquals(0f, InputLevel.fromPcm(ByteArray(3200)), 0f)
        assertEquals(0f, InputLevel.fromPcm(pcm(1,-1,10,-10)), 0f)
    }
    @Test fun measuredAmplitudeControlsTheLevelWithoutChangingInput() {
        val quiet=pcm(500,-500,500,-500);val before=quiet.clone()
        val loud=pcm(10000,-10000,10000,-10000)
        assertTrue(InputLevel.fromPcm(loud)>InputLevel.fromPcm(quiet))
        assertTrue(InputLevel.fromPcm(quiet)>0)
        assertArrayEquals(before,quiet)
        assertEquals(InputLevel.fromPcm(pcm(10000)),InputLevel.fromPcm(pcm(-10000)),0.0001f)
        assertEquals(1f,InputLevel.fromPcm(pcm(-32768)),0.0001f)
        assertEquals(0f,InputLevel.fromPcm(pcm(0,0,32767),4),0f)
    }
}
