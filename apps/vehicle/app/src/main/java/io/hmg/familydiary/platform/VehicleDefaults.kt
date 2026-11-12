package io.hmg.familydiary.platform

/** Suggested defaults never replace a user's saved or edited value. */
object VehicleDefaults {
    fun text(value: String?): String? = value?.trim()?.takeIf {
        it.isNotEmpty() && it.length <= 60 && it.lowercase() !in setOf("unknown", "n/a", "null", "undefined")
    }
    fun year(value: Int?): String? = value?.takeIf { it in 1886..2100 }?.toString()
    fun merge(current: String, edited: Boolean, suggested: String?): String =
        if (current.isBlank() && !edited) text(suggested) ?: current else current
}
