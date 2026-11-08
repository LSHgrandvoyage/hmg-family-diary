package io.hmg.familydiary.capture

/** SDK utterance boundaries are not file/session boundaries. Main-thread confined. */
class SpeechTranscript {
    private val segments = mutableListOf<String>()
    var partial = ""; private set
    var inputComplete = false; private set
    private var ended = false
    val completedCount get() = segments.size
    val text get() = (segments + listOf(partial).filter { it.isNotBlank() }).joinToString("\n")
    val canFinish get() = inputComplete && ended
    fun started() { ended = false }
    fun updated(text: String, completed: Boolean) {
        if (completed) {
            if (text.isNotBlank()) segments.add(text)
            partial = ""
        } else partial = text
    }
    fun ended() { ended = true }
    fun sentAll() { inputComplete = true }
}
