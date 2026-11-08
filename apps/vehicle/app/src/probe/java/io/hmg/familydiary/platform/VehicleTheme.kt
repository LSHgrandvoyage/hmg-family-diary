package io.hmg.familydiary.platform

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.View
import android.widget.*

/** Native adaptation of the approved web k-style tokens; deliberately light in both OS themes. */
class VehicleTheme(val context: Context) {
    val bg = Color.rgb(241, 243, 245)
    val surface = Color.WHITE
    val ink = Color.rgb(25, 31, 38)
    val muted = Color.rgb(73, 80, 86)
    val line = Color.rgb(213, 219, 225)
    val blue = Color.rgb(10, 112, 194) // white text contrast, web brand-text token
    val tint = Color.rgb(231, 244, 253)
    val danger = Color.rgb(200, 51, 35)
    fun dp(n: Int) = (n * context.resources.displayMetrics.density).toInt()
    fun shape(color: Int = surface, radius: Int = 12, stroke: Int? = null) = GradientDrawable().apply {
        setColor(color); cornerRadius = dp(radius).toFloat()
        stroke?.let { setStroke(dp(1), it) }
    }
    fun column() = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    fun row() = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    fun text(value: String, size: Float = 20f, bold: Boolean = false, color: Int = ink) = TextView(context).apply {
        text = value; textSize = size; setTextColor(color); setLineSpacing(dp(4).toFloat(), 1.08f)
        if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
        includeFontPadding = false
    }
    fun add(parent: LinearLayout, view: View, top: Int = 0, width: Int = -1) {
        parent.addView(view, LinearLayout.LayoutParams(width, -2).apply { topMargin = dp(top) })
    }
    fun card(parent: LinearLayout, top: Int = 16): LinearLayout = column().also {
        it.background = shape(); it.setPadding(dp(28), dp(28), dp(28), dp(28)); add(parent, it, top)
    }
    fun style(button: Button, primary: Boolean = false) {
        button.isAllCaps = false; button.textSize = 20f; button.minimumHeight = dp(64)
        button.setPadding(dp(20), dp(14), dp(20), dp(14))
        button.stateListAnimator = null
        button.setTextColor(ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf()),
            intArrayOf(muted, if (primary) surface else ink)))
        val base = android.graphics.drawable.StateListDrawable().apply {
            addState(intArrayOf(-android.R.attr.state_enabled), shape(line))
            addState(intArrayOf(android.R.attr.state_focused), shape(if (primary) blue else tint, stroke = blue))
            addState(intArrayOf(), shape(if (primary) blue else surface, stroke = if (primary) null else line))
        }
        button.background = RippleDrawable(ColorStateList.valueOf(0x226A9DC7), base, shape())
    }
    fun button(value: String, primary: Boolean = false, action: () -> Unit) = Button(context).apply {
        text = value; style(this, primary); setOnClickListener { action() }
    }
    fun input(name: String, multiline: Boolean = false) = EditText(context).apply {
        id = View.generateViewId(); contentDescription = name; textSize = 20f
        setTextColor(ink); setHintTextColor(muted); minimumHeight = dp(64)
        background = shape(surface, 8, line); setPadding(dp(16), dp(14), dp(16), dp(14))
        inputType = android.text.InputType.TYPE_CLASS_TEXT or if (multiline) android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE else 0
        if (multiline) { minLines = 4; gravity = Gravity.TOP }
    }
    fun check(value: String) = CheckBox(context).apply {
        text = value; textSize = 20f; setTextColor(ink); minHeight = dp(64)
        buttonTintList = ColorStateList.valueOf(blue); setPadding(dp(8), dp(8), dp(8), dp(8))
    }
    fun heading(parent: LinearLayout, title: String, subtitle: String) {
        add(parent, text(title, 36f, true)); add(parent, text(subtitle, 20f, color = muted), 12)
    }
    fun pair(parent: LinearLayout, first: View, second: View) {
        val row = row(); add(parent, row, 16)
        row.addView(first, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = dp(12) })
        row.addView(second, LinearLayout.LayoutParams(0, -2, 1f))
    }
}
