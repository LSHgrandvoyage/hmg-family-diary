package io.hmg.familydiary.capture

/** Original recognized text, never the edited confirmation or generated diary. */
data class SpeechSegment(val text:String,val startMs:Long?=null,val endMs:Long?=null)

object SpeechAlignment {
    // Only the FIRST EPD of a fresh request has a known PCM origin.
    fun first(text:String,baseBytes:Long,on:Long,off:Long,sentBytes:Long):SpeechSegment {
        if(text.isBlank() || on<0 || off<=on || off>sentBytes || on%2L!=0L || off%2L!=0L)
            return SpeechSegment(text)
        return SpeechSegment(text,(baseBytes+on)*1000/PcmWave.BYTES_PER_SECOND,(baseBytes+off)*1000/PcmWave.BYTES_PER_SECOND)
    }
}
