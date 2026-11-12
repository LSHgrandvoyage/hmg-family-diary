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

/** Device-local palette; existing views update without restarting the Activity or media. */
class VehicleTheme(val context: Context) {
    private var dark=resolvedDark(context)
    private val bindings=mutableListOf<()->Boolean>()
    private val palette get()=if(dark) intArrayOf(0xff0b0d12.toInt(),0xff161a22.toInt(),0xfff2f4f8.toInt(),0xffaeb7c6.toInt(),0xff414b5d.toInt(),0xffb4bcff.toInt(),0xff252b3a.toInt(),0xffff9b86.toInt(),0xffff6a4d.toInt())
        else intArrayOf(0xfff4f5f7.toInt(),0xffffffff.toInt(),0xff151923.toInt(),0xff586170.toInt(),0xffd5dae3.toInt(),0xff3346c9.toInt(),0xffe9ecf2.toInt(),0xffb42318.toInt(),0xffff6a4d.toInt())
    val bg get()=palette[0]
    val surface get()=palette[1]
    val ink get()=palette[2]
    val muted get()=palette[3]
    val line get()=palette[4]
    val blue get()=palette[5]
    val tint get()=palette[6]
    val danger get()=palette[7]
    val coral get()=palette[8]
    private fun <T:Any> track(target:T, apply:(T)->Unit) {
        val ref=java.lang.ref.WeakReference(target)
        bindings.add {ref.get()?.let {apply(it);true}?:false}
    }
    private fun colorRole(color:Int)=palette.indexOf(color)
    private fun resolve(role:Int,fallback:Int)=if(role<0)fallback else palette[role]
    fun textColor(view:TextView,color:Int) {val role=colorRole(color);view.setTextColor(color);track(view){it.setTextColor(resolve(role,color))}}
    fun update() {rememberSystem(context);val next=resolvedDark(context);if(next==dark)return;dark=next;bindings.removeAll { !it() }}
    companion object {
        private fun preferences(c:Context)=c.getSharedPreferences("vehicle-profile",Context.MODE_PRIVATE)
        fun mode(c:Context)=preferences(c).getString("display-theme","auto").takeIf { it in setOf("auto","light","dark") }?:"auto"
        fun rememberSystem(c:Context) {val night=c.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK
            if(night in setOf(android.content.res.Configuration.UI_MODE_NIGHT_YES,android.content.res.Configuration.UI_MODE_NIGHT_NO))preferences(c).edit().putBoolean("last-system-dark",night==android.content.res.Configuration.UI_MODE_NIGHT_YES).apply()}
        fun resolvedDark(c:Context):Boolean=when(mode(c)) {
            "dark"->true;"light"->false;else->when(c.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) {
                android.content.res.Configuration.UI_MODE_NIGHT_YES->true
                android.content.res.Configuration.UI_MODE_NIGHT_NO->false
                else->preferences(c).getBoolean("last-system-dark",true)
            }
        }
        fun select(c:Context,mode:String){require(mode in setOf("auto","light","dark"));preferences(c).edit().putString("display-theme",mode).apply()}
        fun state(c:Context)=org.json.JSONObject().put("theme_mode",mode(c)).put("theme_dark",resolvedDark(c))
    }
    fun dp(n: Int) = (n * context.resources.displayMetrics.density).toInt()
    fun shape(color: Int = surface, radius: Int = 24, stroke: Int? = null) = GradientDrawable().apply {
        val role=colorRole(color);val strokeRole=stroke?.let {colorRole(it)}
        track(this) { it.setColor(resolve(role,color));if(stroke!=null)it.setStroke(dp(1),resolve(strokeRole!!,stroke)) }
        setColor(color); cornerRadius = dp(radius).toFloat()
        stroke?.let { setStroke(dp(1), it) }
    }
    fun column() = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    fun row() = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    fun text(value: String, size: Float = 20f, bold: Boolean = false, color: Int = ink) = TextView(context).apply {
        text = value; textSize = size; textColor(this,color); setLineSpacing(dp(4).toFloat(), 1.08f)
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
            addState(intArrayOf(-android.R.attr.state_enabled), shape(surface))
            addState(intArrayOf(android.R.attr.state_focused), shape(if (primary) ink else tint, stroke = blue))
            addState(intArrayOf(), shape(if (primary) ink else tint, stroke = null))
        }
        track(button) { it.setTextColor(ColorStateList(arrayOf(intArrayOf(-android.R.attr.state_enabled),intArrayOf()),intArrayOf(muted,if(primary)surface else ink))) }
        button.background = RippleDrawable(ColorStateList.valueOf(0x226A9DC7), base, shape())
    }
    fun button(value: String, primary: Boolean = false, action: () -> Unit) = Button(context).apply {
        text = value; style(this, primary); setOnClickListener { action() }
    }
    fun input(name: String, multiline: Boolean = false) = EditText(context).apply {
        id = View.generateViewId(); contentDescription = name; textSize = 20f
        textColor(this,ink); setHintTextColor(muted);track(this){it.setHintTextColor(muted)}; minimumHeight = dp(64)
        background = shape(surface, 8, line); setPadding(dp(16), dp(14), dp(16), dp(14))
        inputType = android.text.InputType.TYPE_CLASS_TEXT or if (multiline) android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE else 0
        if (multiline) { minLines = 4; gravity = Gravity.TOP }
    }
    fun check(value: String) = CheckBox(context).apply {
        text = value; textSize = 20f; textColor(this,ink); minHeight = dp(64)
        track(this){it.buttonTintList=ColorStateList.valueOf(blue)}
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
