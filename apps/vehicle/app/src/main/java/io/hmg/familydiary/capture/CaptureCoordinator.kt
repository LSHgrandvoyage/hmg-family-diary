package io.hmg.familydiary.capture

/** Platform-independent safety policy. Speed zero is deliberately not an input. */
class CaptureCoordinator(private val stopInputAndPlayback: () -> Unit) {
    enum class Parked { PARKED, NOT_PARKED, UNKNOWN }
    enum class State { IDLE, ACTIVE, ENDED, INTERRUPTED }
    data class Turn(val id: Long, val memberId: String)
    var state = State.IDLE; private set
    private var parked = Parked.UNKNOWN
    private var uxAllowed = false
    private var focused = false
    private var nextTurn = 0L
    private val turns = mutableMapOf<Long, Turn>()
    val allowed get() = parked == Parked.PARKED && uxAllowed && focused
    fun observe(value: Parked, ux: Boolean, focus: Boolean) {
        parked = value; uxAllowed = ux; focused = focus
        if (!allowed) {
            stopInputAndPlayback()
            if (state == State.ACTIVE) state = State.INTERRUPTED
        }
    }
    fun start(memberId: String): Turn {
        check(allowed) { "PARKING_NOT_VERIFIED" }
        check(state != State.ACTIVE) { "ALREADY_ACTIVE" }
        require(memberId.isNotBlank())
        state = State.ACTIVE
        return selectMember(memberId)
    }
    fun selectMember(memberId: String): Turn {
        check(state == State.ACTIVE && allowed)
        require(memberId.isNotBlank())
        return Turn(++nextTurn, memberId).also { turns[it.id] = it }
    }
    // Completion uses the turn captured at recognition start, never the currently selected member.
    fun memberForResult(turnId: Long): String? = turns[turnId]?.memberId
    fun finish() { if (state == State.ACTIVE) state = State.ENDED; stopInputAndPlayback() }
}
