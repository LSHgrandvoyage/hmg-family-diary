package io.hmg.familydiary.platform

import android.content.Context
import android.view.Gravity
import android.view.View
import android.widget.*
import io.hmg.familydiary.R

/** Product entry only. Vehicle simulation and permissions remain owned by MainActivity. */
class WelcomePanel(
    context: Context,
    private val ui: VehicleTheme,
    onStart: () -> Unit,
    onLater: () -> Unit,
    onTheme: () -> Unit
) : ScrollView(context) {
    val acknowledgement = ui.check("함께 탄 가족에게 녹음과 보관을 알렸어요")
    val start = ui.button("시작하기", true, onStart)
    val later = ui.button("나중에", false, onLater)
    private val theme = ui.button("화면 모드", false, onTheme)
    private val readiness = ui.text("", 16f, color = ui.muted)
    private val intro = ui.text("이야기를 남기기 전에", 28f, true)
    private var serviceReady = false
    private var waitingForMotion = false

    init {
        tag = "first-use"
        contentDescription = "차곡차곡 시작 안내"
        isFillViewport = true
        background = ui.shape(ui.bg, 0)
        val wide = resources.configuration.screenWidthDp >= 850
        val page = ui.column().apply { setPadding(ui.dp(if(wide) 52 else 24), ui.dp(30), ui.dp(if(wide) 52 else 24), ui.dp(32)) }
        addView(page)
        val header = ui.row()
        val mark = ImageView(context).apply {
            setImageResource(R.drawable.ic_chagok_logo)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        header.addView(mark, LinearLayout.LayoutParams(ui.dp(40), ui.dp(40)).apply { marginEnd=ui.dp(12) })
        header.addView(ui.text("차곡차곡", 24f, true), LinearLayout.LayoutParams(0, -2, 1f))
        theme.textSize=16f;theme.minimumHeight=ui.dp(48)
        header.addView(theme, LinearLayout.LayoutParams(-2, ui.dp(52)))
        ui.add(page, header)
        val content = LinearLayout(context).apply {
            orientation=if(wide) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
            gravity=Gravity.CENTER_VERTICAL
        }
        page.addView(content, LinearLayout.LayoutParams(-1, if(wide) 0 else -2, if(wide) 1f else 0f).apply{topMargin=ui.dp(32)})
        val hero = ui.column()
        ui.add(hero, ui.text("오늘의 이야기가,", if(wide) 42f else 32f, true))
        ui.add(hero, ui.text("오래 남을 추억으로", if(wide) 42f else 32f, true), 8)
        ui.add(hero, ui.text("함께 웃고 이야기한 순간을\n우리 차에 차곡차곡 담아 보세요.", 20f, color=ui.muted), 24)
        val voice = ui.row().apply { setPadding(0, ui.dp(36), 0, 0) }
        val heights=intArrayOf(18,32,48,28,56,40,22,36,18)
        heights.forEach { h -> voice.addView(View(context).apply { background=ui.shape(ui.coral,4) }, LinearLayout.LayoutParams(ui.dp(5),ui.dp(h)).apply { marginEnd=ui.dp(6) }) }
        voice.importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        ui.add(hero, voice)
        content.addView(hero, LinearLayout.LayoutParams(if(wide) 0 else -1,-2,if(wide) 1f else 0f).apply { if(wide) marginEnd=ui.dp(48) })
        val card=ui.column().apply {background=ui.shape(ui.surface,28);setPadding(ui.dp(32),ui.dp(30),ui.dp(32),ui.dp(28))}
        content.addView(card,LinearLayout.LayoutParams(if(wide) 0 else -1,-2,if(wide) 1.1f else 0f).apply {if(!wide)topMargin=ui.dp(32)})
        ui.add(card,intro)
        fun note(icon:Int,title:String,body:String) {
            val row=ui.row().apply { gravity=Gravity.TOP }
            row.addView(ImageView(context).apply {
                setImageDrawable(NavigationIcon(icon,ui.coral));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
            },LinearLayout.LayoutParams(ui.dp(24),ui.dp(24)).apply {marginEnd=ui.dp(16);topMargin=ui.dp(2)})
            val words=ui.column();ui.add(words,ui.text(title,20f,true));ui.add(words,ui.text(body,17f,color=ui.muted),8)
            row.addView(words,LinearLayout.LayoutParams(0,-2,1f));ui.add(card,row,24)
        }
        note(1,"목소리도 함께 보관해요","녹음 원본과 인식문, 일기를 남겨\n그날의 목소리를 다시 들을 수 있어요.")
        note(0,"연결한 가족과 함께 봐요","휴대폰을 연결하면 완성 일기와 원본,\n차량 정보·녹음 위치가 가족 보관함에 자동 저장돼요.")
        acknowledgement.textSize=17f
        acknowledgement.background=ui.shape(ui.tint,16)
        acknowledgement.setPadding(ui.dp(12),ui.dp(10),ui.dp(12),ui.dp(10))
        ui.add(card,acknowledgement,26)
        readiness.accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE
        ui.add(card,readiness,12)
        val actions=ui.row()
        actions.addView(later,LinearLayout.LayoutParams(0,ui.dp(60),1f).apply{marginEnd=ui.dp(12)})
        actions.addView(start,LinearLayout.LayoutParams(0,ui.dp(60),2f))
        ui.add(card,actions,20)
        acknowledgement.setOnCheckedChangeListener { _, _ -> updateButton() }
        start.background=android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(0x226A9DC7),
            android.graphics.drawable.StateListDrawable().apply {
                addState(intArrayOf(-android.R.attr.state_enabled),ui.shape(ui.tint,20))
                addState(intArrayOf(android.R.attr.state_focused),ui.shape(ui.ink,20,ui.blue))
                addState(intArrayOf(),ui.shape(ui.ink,20))
            },ui.shape())
        update(false,false)
    }
    fun update(ready:Boolean, acceptedButUnknown:Boolean) {
        serviceReady=ready;waitingForMotion=acceptedButUnknown
        acknowledgement.visibility=if(waitingForMotion)View.GONE else View.VISIBLE
        intro.text=if(waitingForMotion)"차량 상태를 확인하고 있어요" else "이야기를 남기기 전에"
        readiness.text=when {
            waitingForMotion->"상태가 확인되면 이어갈 수 있어요. 녹음은 자동으로 시작되지 않아요."
            !serviceReady->"녹음 기능을 준비하고 있어요."
            else->"참여를 원하지 않으면 나중에 시작해도 괜찮아요."
        }
        updateButton()
        theme.visibility=if(waitingForMotion)View.INVISIBLE else View.VISIBLE
        theme.text=when(VehicleTheme.mode(context)){"light"->"화면 · 라이트";"dark"->"화면 · 다크";else->"화면 · 자동"}
    }
    private fun updateButton() {start.isEnabled=serviceReady && !waitingForMotion && acknowledgement.isChecked}
}
