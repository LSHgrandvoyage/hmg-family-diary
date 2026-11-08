package io.hmg.familydiary

import io.hmg.familydiary.capture.PcmWave
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PcmWaveTest {
    @get:Rule val folder = TemporaryFolder()

    @Test fun savedPayloadIsByteIdenticalToSttChunks() {
        // Synthetic PCM; no personal audio is used in tests.
        val pcm = ByteArray(9_602) { (it % 251).toByte() }
        val partial = File(folder.root, "test.partial")
        val final = File(folder.root, "test.wav")
        PcmWave.Writer(partial).use { it.append(pcm, pcm.size); it.finish(final) }
        val chunks = mutableListOf<ByteArray>()
        assertEquals(pcm.size.toLong(), PcmWave.stream(final) { chunks.add(it) })
        assertEquals(listOf(3200, 3200, 3200, 2), chunks.map { it.size })
        assertArrayEquals(pcm, chunks.fold(byteArrayOf()) { all, chunk -> all + chunk })
        assertFalse(partial.exists())
        val header = ByteBuffer.wrap(final.readBytes()).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals(16_000, header.getInt(24))
        assertEquals(pcm.size, header.getInt(40))
        assertEquals(64, PcmWave.sha256(final).length)
    }

    @Test fun finalizingDoesNotOverwriteAnEarlierOriginal() {
        val final = folder.newFile("old.wav").apply { writeText("original") }
        PcmWave.Writer(File(folder.root, "new.partial")).use {
            it.append(byteArrayOf(0, 1), 2)
            assertThrows(IllegalArgumentException::class.java) { it.finish(final) }
        }
        assertEquals("original", final.readText())
    }

    @Test fun emptyAndOddPayloadsAreNotFinalized() {
        PcmWave.Writer(File(folder.root, "empty.partial")).use {
            assertThrows(IllegalArgumentException::class.java) { it.finish(File(folder.root, "empty.wav")) }
            assertThrows(IllegalArgumentException::class.java) { it.append(byteArrayOf(1), 1) }
        }
    }

    @Test fun truncatedOrAlteredFormatIsNotSentToStt() {
        val file = folder.newFile("bad.wav")
        file.writeBytes(PcmWave.header(4) + byteArrayOf(0, 0))
        assertThrows(IllegalArgumentException::class.java) { PcmWave.stream(file) { fail("must not send") } }
        val wrongRate = PcmWave.header(2).apply { this[24] = 0 }
        file.writeBytes(wrongRate + byteArrayOf(0, 0))
        assertThrows(IllegalArgumentException::class.java) { PcmWave.payloadBytes(file) }
    }

    @Test fun checkpointKeepsARecoverablePartialWithoutPublishingIt() {
        val partial = File(folder.root, "interrupted.partial")
        PcmWave.Writer(partial).use { it.append(ByteArray(32_000), 32_000) }
        assertEquals(32_000L, PcmWave.payloadBytes(partial))
        assertFalse(File(folder.root, "interrupted.wav").exists())
    }
}
