package io.hmg.familydiary

import android.widget.CheckBox

/** Explicit simulator state injection for legacy lower-level fixtures, not user onboarding. */
internal fun MainActivity.gateTestControls():List<CheckBox> = listOf("parked","consent","driving").map {
    javaClass.getDeclaredField(it).apply{isAccessible=true}.get(this) as CheckBox
}
