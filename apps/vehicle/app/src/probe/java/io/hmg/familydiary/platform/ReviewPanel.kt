package io.hmg.familydiary.platform

import android.app.Activity
import android.graphics.Color
import android.text.Editable
import android.text.TextWatcher
import android.view.View
import android.widget.*
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Sequential bench flow; never claims to be the authenticated family library. */
class ReviewPanel(private val activity: Activity, parent: LinearLayout, private val allowed: () -> Boolean,
    private val audioIdle: () -> Boolean, private val canReview: () -> Boolean, private val onChange: () -> Unit,
    private val onSaved: () -> Unit = {}) {
    private val ui = VehicleTheme(activity)
    private val store = ReviewStore(File(activity.filesDir, "capture-review"))
    private val generator = DiaryProbe(activity)
    private val root = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(24), dp(24), dp(24)); background = ui.shape()
    }
    private fun dp(value: Int) = (value * activity.resources.displayMetrics.density).toInt()
    private fun label(value: String, size: Float = 20f) = ui.text(value, size, size >= 24f).also {
        ui.add(root, it, 16)
    }
    private fun editor(name: String, multiline: Boolean = false) = ui.input(name, multiline).also { ui.add(root, it, 8) }
    private fun button(title: String, action: () -> Unit) = ui.button(title,
        title == "일기 초안 만들기" || title == "검토한 일기 이 기기에 저장", action).also { ui.add(root, it, 16) }
    private val raw: TextView
    private val speaker: EditText
    private val recordedAt: EditText
    private val text: EditText
    private val confirm: Button
    private val sendConsent: CheckBox
    private val generate: Button
    private val cancelGeneration: Button
    private val feedback: TextView
    private val draft: TextView
    private val accept: Button
    private var current: ReviewRecord? = null
    private var selectedId: String? = null
    private var binding = false
    private var dirty = false
    val busy get() = generator.busy
    val fileId get() = selectedId
    val record get() = current
    private val dateFormat = DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm").withResolverStyle(java.time.format.ResolverStyle.STRICT)
    private val zone = ZoneId.of("Asia/Seoul")
    private fun displayDate(value: String) = runCatching { Instant.parse(value).atZone(zone).format(dateFormat) }.getOrDefault(value)

    init {
        parent.addView(root, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(24) })
        label("이야기를 일기로", 28f)
        label(when(generator.mode) {
            "mock" -> "목업 모드 · AI 정리 전\n확인한 이야기를 그대로 담아 저장 흐름을 시험해요. 외부 AI를 호출하지 않아요."
            "openai" -> "OpenAI 생성 모드 · 전송 동의 후 초안을 만들어요."
            else -> "생성 서버 연결 설정이 필요해요. 연결 후 앱을 다시 열어 주세요."
        })
        label("원본 듣기 → 인식문 확인 → 일기 초안 검토\n이 실험은 한 녹음의 화자를 직접 지정해요. 여러 사람이 말했으면 화자를 구분해 확인해 주세요.")
        label("1. 원래 인식문", 24f)
        raw = label("같은 원본으로 STT를 실행해 주세요.")
        raw.setTextIsSelectable(true)
        raw.visibility = View.GONE
        button("원래 인식문 보기 / 접기") { raw.visibility = if (raw.visibility == View.GONE) View.VISIBLE else View.GONE }
        val speakerLabel = label("말한 사람의 별칭")
        speaker = editor("말한 사람의 별칭"); speakerLabel.labelFor = speaker.id
        speaker.filters = arrayOf(android.text.InputFilter.LengthFilter(40))
        val dateLabel = label("녹음 날짜·시각 (한국 시간) · 이전 원본의 시각은 확인해 주세요")
        recordedAt = editor("녹음 시각 확인"); dateLabel.labelFor = recordedAt.id
        recordedAt.hint = "예: 2026-11-08 13:00"
        val textLabel = label("2. 확인할 이야기 · 잘못 들은 말만 고쳐도 돼요", 24f)
        text = editor("확인할 이야기", true); textLabel.labelFor = text.id
        confirm = button("확인문 저장") { save(true) }
        sendConsent = CheckBox(activity).apply {
            text = if (generator.mode == "mock") "확인문·별칭·녹음 시각을 맥북의 목업 서버로 보내겠습니다. 외부 AI와 음성 파일 전송은 사용하지 않습니다."
                else "확인문·별칭·녹음 시각을 OpenAI에 보내 일기를 만들겠습니다. 음성 파일은 보내지 않습니다."
            textSize = 20f; setTextColor(ui.ink); buttonTintList = android.content.res.ColorStateList.valueOf(ui.blue); minHeight = dp(64); root.addView(this)
        }
        generate = button("일기 초안 만들기") { generate() }
        cancelGeneration = button("초안 생성 중단") { cancel(); onChange() }
        feedback = label("원본을 선택해 주세요.")
        feedback.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        label("3. 일기 초안", 24f)
        draft = label("생성된 내용을 원본과 비교한 뒤 저장해 주세요.")
        draft.setTextIsSelectable(true)
        accept = button("검토한 일기 이 기기에 저장") {
            val r = current ?: return@button
            if (!allowed() || busy || dirty || r.draft == null || r.draftRevision != r.revision || r.confirmed != r.revision) return@button
            if (persist(r.copy(accepted = r.revision), "${if (r.generationMode == "mock") "목업 " else ""}일기 저장 완료 · 이 실험 앱에만 보관됨. 휴대폰 동기화는 아직 없어요.")) onSaved()
        }
        val watcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                if (!binding) { dirty = true; feedback.text = "수정 중 · 확인문 저장 후 생성할 수 있어요."; render() }
            }
            override fun afterTextChanged(s: Editable?) = Unit
        }
        speaker.addTextChangedListener(watcher); recordedAt.addTextChangedListener(watcher); text.addTextChangedListener(watcher)
        sendConsent.setOnCheckedChangeListener { _, checked -> if (!checked && busy) cancel(); render() }
        render()
    }
    fun select(file: File?, loaded: ReviewRecord? = null): Boolean {
        if (file?.name == selectedId) return true
        if (!save(false)) return false // Never silently replace unsaved edits after a disk failure.
        cancel(); selectedId = file?.name; current = null; sendConsent.isChecked = false
        if (file != null) {
            try { current = loaded ?: store.load(file) }
            catch (_: Exception) { feedback.text = "검토 기록을 열지 못했어요. 원본 변경·저장 오류를 확인해 주세요." }
        }
        bind()
        current?.let { r ->
            feedback.text = when {
                r.draft != null && r.accepted == r.revision -> "저장한 ${if (r.generationMode == "mock") "목업 " else ""}일기를 불러왔어요. 원본도 다시 들을 수 있어요."
                r.draft != null && r.draftRevision != r.revision -> "수정 전 초안이 남아 있어요. 확인문 저장 후 다시 생성해 주세요."
                r.draft != null -> "검토 전 초안을 불러왔어요. 원본과 비교한 뒤 저장해 주세요."
                r.confirmed == r.revision -> "저장한 확인문을 불러왔어요. 생성 안내 확인 후 초안을 만들 수 있어요."
                else -> "선택한 원본을 들으며 이야기를 확인해 주세요."
            }
        }
        return true
    }
    fun speechResult(file: File, value: String) {
        if (file.name != selectedId || !allowed() || !save(false)) return
        val r = current ?: return
        if (value.isNotBlank() && persist(r.withSpeech(value), "인식문을 받았어요. 원본을 들으며 확인해 주세요.")) bind()
    }
    private fun bind() {
        binding = true
        raw.text = current?.rawHistory?.lastOrNull() ?: "인식문이 없어요. STT를 실행하거나 원본을 듣고 직접 입력할 수 있어요."
        speaker.setText(current?.speaker ?: ""); text.setText(current?.text ?: ""); recordedAt.setText(current?.recordedAt?.let { displayDate(it) } ?: "")
        binding = false; dirty = false; render()
    }
    private fun persist(next: ReviewRecord, message: String): Boolean = try {
        store.save(next); current = next; dirty = false; feedback.text = message; render(); true
    } catch (_: Exception) { feedback.text = "저장하지 못했어요. 입력은 화면에 남아 있어요. 저장 공간을 확인하고 다시 시도해 주세요."; false }
    fun save(confirmInput: Boolean = false): Boolean {
        val r = current ?: return true
        if (!dirty && !confirmInput) return true
        if (confirmInput && (!allowed() || busy)) return false
        return try {
            val dateText = recordedAt.text.toString().trim()
            val instant = if (dateText == displayDate(r.recordedAt)) r.recordedAt else LocalDateTime.parse(dateText, dateFormat).atZone(zone).toInstant().toString()
            var edited = r.edit(text.text.toString(), speaker.text.toString().trim(), instant)
            if (confirmInput) edited = edited.confirm()
            persist(edited, if (confirmInput) "확인문 저장 완료 · 원본 녹음은 바뀌지 않았어요." else "수정 중인 내용을 이 기기에 보관했어요. 생성 전 확인문을 저장해 주세요.")
        } catch (_: Exception) { feedback.text = "이야기·화자 별칭과 녹음 시각(예: 2026-11-08 13:00)을 확인해 주세요."; false }
    }
    private fun generate() {
        val r = current ?: return
        if (!allowed() || !audioIdle() || busy || dirty || generator.mode == null || !sendConsent.isChecked || r.confirmed != r.revision) return
        feedback.text = "일기 초안을 만들고 있어요. 원본과 확인문은 이 기기에 보관돼 있어요."
        generator.run(r.input()) { response, error ->
            if (current?.id == r.id && current?.revision == r.revision && allowed()) {
                if (response != null) try { persist(r.adopt(response), if (generator.mode == "mock") "목업 초안이 준비됐어요. AI 정리 없이 확인문을 그대로 담았어요." else "초안이 준비됐어요. 원본과 비교한 뒤 저장해 주세요.") }
                catch (_: Exception) { feedback.text = "현재 확인문과 맞지 않는 응답이라 반영하지 않았어요." }
                else feedback.text = error
            }
            render(); onChange()
        }
        render(); onChange()
    }
    fun cancel() { if (busy) feedback.text = "생성을 중단했어요. 원본·확인문·이전 초안은 보관했어요."; generator.cancel(); render() }
    fun forgetDeleted() {
        cancel(); current = null; selectedId = null; dirty = false; bind()
    }
    fun clear(): Boolean {
        cancel()
        val success = store.clear()
        if (success) { current = null; selectedId = null; dirty = false; bind() }
        return success
    }
    fun render() {
        root.visibility = if (allowed()) View.VISIBLE else View.GONE
        val r = current
        val editAllowed = allowed() && !busy && canReview() && r != null
        speaker.isEnabled = editAllowed; text.isEnabled = editAllowed; recordedAt.isEnabled = editAllowed
        confirm.isEnabled = editAllowed
        sendConsent.isEnabled = allowed() && !busy && r != null
        generate.isEnabled = editAllowed && generator.mode != null && audioIdle() && !dirty && sendConsent.isChecked && r?.confirmed == r?.revision
        accept.isEnabled = editAllowed && !dirty && r?.draft != null && r.draftRevision == r.revision && r.confirmed == r.revision
        cancelGeneration.visibility = if (busy) View.VISIBLE else View.GONE
        draft.text = r?.draft?.let { renderDraft(r, it) } ?: "생성된 내용을 원본과 비교한 뒤 저장해 주세요."
    }
    private fun renderDraft(r: ReviewRecord, json: String): String = try {
        val d = JSONObject(json)
        buildString {
            if (r.generationMode == "mock") append("목업 · AI 정리 전\n확인문을 그대로 담은 시험용 응답이에요. 사건·장소·시점을 분류한 결과가 아니에요.\n\n")
            append(when { dirty || r.draftRevision != r.revision -> "이전 확인문으로 만든 초안 · 다시 생성해 주세요.\n\n"
                r.accepted == r.revision -> "이 기기에 저장한 일기\n\n"; else -> "검토 전 초안\n\n" })
            val groups = d.getJSONArray("groups")
            for (i in 0 until groups.length()) {
                val g = groups.getJSONObject(i)
                append(g.getString("label")).append(" · ").append(if (r.generationMode == "mock") "확인문 원문" else when(g.getString("time_relation")) { "planned" -> "계획"; "occurred" -> "지난 이야기"; else -> "시점 확인 필요" }).append('\n')
                if (!g.isNull("date")) append(g.getString("date")).append(' ')
                if (!g.isNull("place_label")) append(g.getString("place_label"))
                append('\n')
                val statements = g.getJSONArray("statements")
                for (j in 0 until statements.length()) append(statements.getJSONObject(j).getString("text")).append('\n')
                if (g.getBoolean("needs_review")) append("확인이 필요한 내용이 있어요.\n")
                append('\n')
            }
            val reviews = d.getJSONArray("review_items")
            for (i in 0 until reviews.length()) append("확인: ").append(reviews.getJSONObject(i).getString("message")).append('\n')
            append("제외된 근거: ${d.getJSONArray("excluded_spans").length()}개 · 전체 원본에서 확인할 수 있어요.\n")
            append("근거 듣기: 위 ‘원본 재생’ · 전체 녹음 연결 (세부 구간 미검증)\n")
            append(if (r.generationMode == "mock") "목업 응답이에요. AI 생성 품질을 검증한 결과가 아니에요." else "AI가 만든 초안이에요. 원래 이야기와 비교해 주세요.")
        }
    } catch (_: Exception) { "초안을 표시할 수 없어요. 이전 저장본은 유지됩니다." }
}
