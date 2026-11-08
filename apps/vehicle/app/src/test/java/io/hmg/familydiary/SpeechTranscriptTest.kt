package io.hmg.familydiary

import io.hmg.familydiary.capture.SpeechTranscript
import org.junit.Assert.*
import org.junit.Test

class SpeechTranscriptTest {
    @Test fun utteranceEndDoesNotStopRemainingFileInput() {
        val state = SpeechTranscript()
        state.updated("첫 문장", true); state.ended()
        assertFalse(state.canFinish)
        state.started(); state.updated("두 번째 문장", true)
        state.sentAll()
        assertFalse(state.canFinish)
        state.ended()
        assertTrue(state.canFinish)
        assertEquals("첫 문장\n두 번째 문장", state.text)
    }
    @Test fun partialUpdatesDoNotOverwriteEarlierFinals() {
        val state = SpeechTranscript()
        state.updated("완료된 말", true)
        state.updated("다음", false); state.updated("다음 이야기", false)
        assertEquals("완료된 말\n다음 이야기", state.text)
        assertEquals(1, state.completedCount)
        assertEquals("다음 이야기", state.partial)
    }
    @Test fun silenceNeverCreatesAnInventedTranscript() {
        val state = SpeechTranscript()
        state.sentAll(); state.ended()
        assertTrue(state.canFinish)
        assertEquals("", state.text)
        assertEquals(0, state.completedCount)
    }
}
