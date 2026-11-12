package io.hmg.familydiary.capture

import kotlin.math.log10
import kotlin.math.sqrt

/** RMS of the captured PCM16 little-endian samples, mapped from -60..0 dBFS. */
object InputLevel {
    fun fromPcm(bytes: ByteArray, size: Int = bytes.size): Float {
        require(size in 0..bytes.size && size % 2 == 0)
        if (size == 0) return 0f
        var sum = 0.0
        for (i in 0 until size step 2) {
            val sample = ((bytes[i].toInt() and 255) or (bytes[i + 1].toInt() shl 8)).toShort().toDouble()
            sum += sample * sample
        }
        val rms = sqrt(sum / (size / 2)) / 32768.0
        return if (rms <= 0.001) 0f else ((20 * log10(rms) + 60) / 60).coerceIn(0.0, 1.0).toFloat()
    }
}
