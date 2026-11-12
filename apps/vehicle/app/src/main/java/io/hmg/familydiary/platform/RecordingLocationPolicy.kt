package io.hmg.familydiary.platform

/** Selection at recording start, never at save/review time. */
object RecordingLocationPolicy {
    const val MAX_AGE_MS = 30_000L
    fun status(startedAtMs:Long, observedAtMs:Long, latitude:Double, longitude:Double):String = when {
        !latitude.isFinite() || !longitude.isFinite() || latitude !in -90.0..90.0 || longitude !in -180.0..180.0 -> "error"
        observedAtMs <= 0 || observedAtMs > startedAtMs -> "error"
        startedAtMs-observedAtMs > MAX_AGE_MS -> "stale"
        else -> "available"
    }
}
