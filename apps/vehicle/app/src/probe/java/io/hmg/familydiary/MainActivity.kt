package io.hmg.familydiary

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.*
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.io.File

/** Integrated local vehicle prototype; emulator-only. Production Pleos gates remain separate. */
class MainActivity : Activity() {
    private enum class Screen { LIBRARY, RECORD, DETAIL, SETTINGS }
    private lateinit var ui: VehicleTheme
    private lateinit var capture: CaptureProbe
    private lateinit var speech: SpeechProbe
    private lateinit var review: ReviewPanel
    private lateinit var store: ReviewStore
    private lateinit var contexts: MemoryContextStore
    private lateinit var sync: CloudSync
    @Volatile private var syncBusy = false
    private lateinit var directory: File
    private lateinit var audio: AudioManager
    private lateinit var focusRequest: AudioFocusRequest
    private lateinit var status: TextView
    private lateinit var parked: CheckBox
    private lateinit var consent: CheckBox
    private lateinit var gate: ScrollView
    private lateinit var library: ScrollView
    private lateinit var recording: ScrollView
    private lateinit var detail: ScrollView
    private lateinit var settings: ScrollView
    private lateinit var list: LinearLayout
    private lateinit var libraryCount: TextView
    private lateinit var search: EditText
    private lateinit var months: Spinner
    private lateinit var record: Button
    private lateinit var finish: Button
    private lateinit var timer: TextView
    private lateinit var captureContext: TextView
    private lateinit var play: Button
    private lateinit var stop: Button
    private lateinit var seek: SeekBar
    private lateinit var position: TextView
    private lateinit var playbackStatus: TextView
    private lateinit var sttStatus: TextView
    private lateinit var recognize: Button
    private lateinit var detailTitle: TextView
    private lateinit var detailMeta: TextView
    private lateinit var readBody: LinearLayout
    private lateinit var originalBody: LinearLayout
    private lateinit var editBody: LinearLayout
    private lateinit var contextBody: LinearLayout
    private lateinit var photosBody: LinearLayout
    private lateinit var photoStatus: TextView
    private lateinit var navigation: List<Button>
    private lateinit var tabs: List<Button>
    private var screen = Screen.LIBRARY
    private var tab = 0
    private var selected: File? = null
    private var entries = emptyList<Pair<File, ReviewRecord?>>()
    private var monthKeys = listOf("전체 기간")
    private var loadGeneration = 0
    private var openGeneration = 0
    private var photoGeneration = 0
    private var modal: AlertDialog? = null
    private var player: MediaPlayer? = null
    private var prepared = false
    private var pendingSeek = 0
    private var playGeneration = 0
    private var foreground = false
    private var hasFocus = false
    private var benchAvailable = false
    private var initialized = false
    private val handler = Handler(Looper.getMainLooper())
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val zone = ZoneId.of("Asia/Seoul")
    private val date = DateTimeFormatter.ofPattern("yyyy년 M월 d일 · HH:mm")
    private val prefs by lazy { getSharedPreferences("vehicle-profile", MODE_PRIVATE) }
    private val ticker = object : Runnable {
        override fun run() {
            if (prepared) runCatching {
                val p = player ?: return@runCatching
                seek.progress = p.currentPosition
                position.text = "${time(p.currentPosition.toLong())} / ${time(p.duration.toLong())}"
            }
            if (player != null) handler.postDelayed(this, 250)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        benchAvailable = BuildConfig.DEBUG && Build.HARDWARE in setOf("ranchu", "goldfish")
        if (!benchAvailable) { setContentView(TextView(this).apply { text = "이 버전은 에뮬레이터에서만 실행할 수 있어요." }); return }
        ui = VehicleTheme(this)
        directory = File(filesDir, "capture-probe")
        store = ReviewStore(File(filesDir, "capture-review"))
        contexts = MemoryContextStore(File(filesDir, "memory-context"))
        sync = CloudSync(filesDir, directory, store, contexts)
        capture = CaptureProbe(directory); speech = SpeechProbe(this)
        audio = getSystemService(AudioManager::class.java)
        focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener { change ->
                if (change != AudioManager.AUDIOFOCUS_GAIN) { hasFocus = false; interrupt("오디오 사용이 중단됐어요. 원본은 보관돼 있어요.") }
            }.build()
        buildShell()
        initialized = true
        refreshLibrary()
    }
    private fun page(): Pair<ScrollView, LinearLayout> {
        val body = ui.column().apply { setPadding(ui.dp(32), ui.dp(32), ui.dp(32), ui.dp(40)); isFocusableInTouchMode = true }
        return ScrollView(this).apply { isFillViewport = true; addView(body) } to body
    }
    private fun buildShell() {
        val wide = resources.configuration.screenWidthDp >= 850
        val shell = LinearLayout(this).apply { orientation = if (wide) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; setBackgroundColor(ui.bg) }
        val rail = ui.column().apply { setPadding(ui.dp(24), ui.dp(32), ui.dp(24), ui.dp(24)); setBackgroundColor(ui.surface) }
        ui.add(rail, ui.text("가족의 이야기", if (wide) 28f else 24f, true))
        if (wide) ui.add(rail, ui.text("차에서 남긴\n우리의 목소리", 18f, color = ui.muted), 16)
        val navParent = if (wide) rail else ui.row().also { ui.add(rail, it, 12) }
        navigation = listOf(
            ui.button("이야기 보관함") { navigate(Screen.LIBRARY) },
            ui.button("새 이야기", true) { navigate(Screen.RECORD) },
            ui.button("차량과 사용 안내") { navigate(Screen.SETTINGS) }
        )
        navigation.forEach { button ->
            if (wide) ui.add(navParent, button, 16)
            else { button.textSize = 16f; navParent.addView(button, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = ui.dp(8) }) }
        }
        if (wide) {
            rail.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
            ui.add(rail, ui.text("차량 UI 미리 보기", 18f, true, ui.blue))
            ui.add(rail, ui.text("모의 주차 · 목업 생성\n선택한 기록 동기화", 16f, color = ui.muted), 12)
        }
        val railView: View = if (wide) ScrollView(this).apply { isFillViewport = true; addView(rail) } else rail
        shell.addView(railView, if (wide) LinearLayout.LayoutParams(ui.dp(248), -1) else LinearLayout.LayoutParams(-1, -2))
        val main = ui.column()
        status = ui.text("주차 상태와 공동 녹음 안내를 확인해 주세요.", 18f, color = ui.muted).apply {
            setPadding(ui.dp(32), ui.dp(16), ui.dp(32), ui.dp(16)); setBackgroundColor(ui.surface)
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        main.addView(status, LinearLayout.LayoutParams(-1, -2))
        val frame = FrameLayout(this)
        main.addView(frame, LinearLayout.LayoutParams(-1, 0, 1f))
        shell.addView(main, if (wide) LinearLayout.LayoutParams(0, -1, 1f) else LinearLayout.LayoutParams(-1, 0, 1f))
        fun attach(view: View) { frame.addView(view, FrameLayout.LayoutParams(-1, -1, Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { if (wide) width = minOf(ui.dp(1160), resources.displayMetrics.widthPixels - ui.dp(248)) }) }
        val (gateScroll, gateBody) = page(); gate = gateScroll
        ui.heading(gateBody, "주차한 뒤,\n우리 이야기를 남겨요", "지나온 곳도, 떠오른 생각도 편하게 말해 주세요.")
        val gateCard = ui.card(gateBody, 32)
        ui.add(gateCard, ui.text("시작하기 전에", 24f, true))
        parked = ui.check("모의 P 상태 확인 · 실제 차량 신호 미연결")
        consent = ui.check("참여자에게 공동 녹음과 보관을 알렸어요")
        ui.add(gateCard, parked, 16); ui.add(gateCard, consent, 8)
        ui.add(gateCard, ui.text("음성과 일기는 이 기기에 보관돼요. 지금은 에뮬레이터용이며, 일기 생성은 목업 서버로 확인문만 보내요. 참여하지 않아도 괜찮아요. 직접 공유하면 음성·글·차량 정보가 가족 보관함에 함께 저장돼요.", 20f, color = ui.muted), 24)
        attach(gate)
        buildLibrary().also { attach(it) }
        buildRecording().also { attach(it) }
        buildDetail().also { attach(it) }
        buildSettings().also { attach(it) }
        parked.setOnCheckedChangeListener { _, checked -> if (!checked) interrupt("모의 P 해제 · 녹음과 재생을 중단했어요.") else { if (allowed()) status.text = "모의 P 확인됨 · 이 기기의 이야기 보관함"; render() } }
        consent.setOnCheckedChangeListener { _, checked -> if (!checked) interrupt("공동 녹음 안내 해제 · 중단했어요.") else { if (allowed()) status.text = "모의 P 확인됨 · 이 기기의 이야기 보관함"; render() } }
        setContentView(shell)
    }
    private fun buildLibrary(): ScrollView {
        val (scroll, body) = page(); library = scroll
        ui.heading(body, "우리 가족의 이야기 보관함", "일기와 그날의 목소리를 함께 꺼내 보세요.")
        val hero = ui.card(body, 24)
        libraryCount = ui.text("보관한 이야기를 불러오고 있어요", 24f, true); ui.add(hero, libraryCount)
        ui.add(hero, ui.text("장소를 고르지 않아도 돼요. 오늘의 이야기를 자유롭게 남겨 보세요.", 20f, color = ui.muted), 12)
        ui.add(hero, ui.button("새 이야기 녹음하기", true) { navigate(Screen.RECORD) }, 24)
        ui.add(hero, ui.button("휴대폰과 동기화") { runSync { sync.pull() } }, 16)
        val filters = ui.card(body)
        val label = ui.text("날짜·이야기로 찾기", 18f, true); ui.add(filters, label)
        search = ui.input("날짜·이야기 검색").apply { hint = "기억나는 말이나 날짜를 입력하세요" }; label.labelFor = search.id
        ui.add(filters, search, 12)
        months = Spinner(this).apply { minimumHeight = ui.dp(64); contentDescription = "기록 연월 선택"; background = ui.shape(ui.bg) }
        ui.add(filters, months, 12)
        months.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { fillLibrary() }
            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }
        search.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { fillLibrary() }
            override fun afterTextChanged(s: android.text.Editable?) = Unit
        })
        list = ui.column(); ui.add(body, list, 16)
        ui.add(body, ui.text("공유 기록은 동기화를 눌러 최신 상태로 가져와요.", 18f, color = ui.muted), 24)
        return scroll
    }
    private fun refreshLibrary() {
        val token = ++loadGeneration
        Thread({
            val data = directory.listFiles()?.filter { it.name.endsWith(".wav") }?.map { file -> file to runCatching { store.load(file) }.getOrNull() }
                ?.sortedByDescending { it.second?.recordedAt ?: Instant.ofEpochMilli(it.first.lastModified()).toString() } ?: emptyList()
            runOnUiThread {
                if (isDestroyed || token != loadGeneration) return@runOnUiThread
                entries = data
                val previous = monthKeys.getOrNull(months.selectedItemPosition)
                monthKeys = listOf("전체 기간") + data.mapNotNull { month(it.second?.recordedAt) }.distinct()
                months.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, monthKeys)
                months.setSelection(monthKeys.indexOf(previous).coerceAtLeast(0)); fillLibrary()
            }
        }, "memory-library").start()
    }
    private fun fillLibrary() {
        if (!::list.isInitialized) return
        list.removeAllViews()
        libraryCount.text = "${entries.size}개의 이야기 · ${entries.count { it.second?.let { r -> r.draft != null && r.accepted == r.revision } == true }}개의 저장한 일기"
        val query = search.text.toString().trim()
        val filter = monthKeys.getOrNull(months.selectedItemPosition) ?: "전체 기간"
        val data = entries.filter { (_, r) -> (filter == "전체 기간" || month(r?.recordedAt) == filter) &&
            (query.isBlank() || "${r?.text.orEmpty()} ${displayDate(r?.recordedAt)} ${r?.recordedAt.orEmpty()} ${r?.speaker.orEmpty()}".contains(query, true)) }
        if (data.isEmpty()) {
            val empty = ui.card(list)
            ui.add(empty, ui.text(if (entries.isEmpty()) "첫 이야기를 기다리고 있어요" else "찾는 이야기가 없어요", 26f, true))
            ui.add(empty, ui.text(if (entries.isEmpty()) "녹음을 마치면 원본과 일기를 이곳에서 다시 만날 수 있어요." else "다른 말이나 날짜로 찾아보세요.", color = ui.muted), 16)
            if (entries.isNotEmpty()) ui.add(empty, ui.button("검색 초기화") { search.setText(""); months.setSelection(0) }, 16)
        }
        var previous = ""
        data.forEach { (file, r) ->
            val key = month(r?.recordedAt) ?: "날짜 확인 필요"
            if (key != previous) { ui.add(list, ui.text(key, 24f, true), 24); previous = key }
            val state = when {
                r == null -> "원본 확인 필요"
                r.draft != null && r.accepted == r.revision -> if (r.generationMode == "mock") "저장한 일기 · 목업" else "저장한 일기"
                r.draft != null -> "검토 중인 초안"
                else -> "원본 보관 · 일기 작성 전"
            }
            val title = r?.text?.trim()?.take(48)?.ifBlank { null } ?: "아직 글로 옮기지 않은 이야기"
            val button = ui.button("${displayDate(r?.recordedAt)}\n$title\n$state · ${time(r?.durationMs ?: 0)}") { openMemory(file) }.apply {
                gravity = Gravity.START or Gravity.CENTER_VERTICAL; setLineSpacing(ui.dp(7).toFloat(), 1.08f)
                tag = "memory:${file.name}"; isEnabled = r != null
            }
            ui.add(list, button, 12)
        }
    }
    private fun buildRecording(): ScrollView {
        val (scroll, body) = page(); recording = scroll
        ui.heading(body, "오늘의 이야기를 들려주세요", "여러 곳의 기억도, 어제와 내일의 이야기도 괜찮아요.")
        val hero = ui.card(body, 32)
        ui.add(hero, ui.text("우리의 목소리", 22f, true, ui.blue))
        timer = ui.text("00:00", 72f, true).apply { gravity = Gravity.CENTER; setPadding(0, ui.dp(40), 0, ui.dp(40)) }; ui.add(hero, timer)
        ui.add(hero, ui.text("한 주제로 나누지 않아도 돼요.\n말을 마치면 내용을 확인하고 일기로 남길 수 있어요.", 24f).apply { gravity = Gravity.CENTER })
        record = ui.button("녹음 시작", true) { startCapture() }
        finish = ui.button("녹음 마치기") { if (capture.busy) { capture.stop(false); finish.isEnabled = false; status.text = "원본을 보관하고 있어요…" } }
        ui.pair(hero, record, finish)
        ui.add(hero, ui.text("직접 시작한 동안만 녹음해요 · 현재 시험 버전은 최대 21분", 18f, color = ui.muted), 24)
        val context = ui.card(body)
        ui.add(context, ui.text("이 기억과 함께 남는 것", 24f, true))
        captureContext = ui.text(""); ui.add(context, captureContext, 16)
        ui.add(context, ui.button("차량 정보 설정") { navigate(Screen.SETTINGS) }, 24)
        return scroll
    }
    private fun buildDetail(): ScrollView {
        val (scroll, body) = page(); detail = scroll
        ui.add(body, ui.button("보관함으로") { navigate(Screen.LIBRARY) }, width = -2)
        detailTitle = ui.text("그날의 이야기", 36f, true); ui.add(body, detailTitle, 24)
        detailMeta = ui.text("", 20f, color = ui.muted); ui.add(body, detailMeta, 12)
        val tabRow = ui.row(); ui.add(body, tabRow, 24)
        tabs = listOf("일기 읽기", "원래 이야기", "내용 확인").mapIndexed { i, title ->
            ui.button(title) { setTab(i) }.also { tabRow.addView(it, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = ui.dp(8) }) }
        }
        ui.add(body, ui.button("휴대폰에 공유") {
            val file = selected
            if (file != null && allowed() && idle() && review.save()) {
                modal = AlertDialog.Builder(this).setTitle("가족 보관함에 공유할까요?")
                    .setMessage("이 일기의 글·녹음 원본·차량 정보와 녹음 시점 위치를 연결한 휴대폰에서도 볼 수 있게 보내요.")
                    .setNegativeButton("취소", null).setPositiveButton("공유") { _, _ -> runSync { sync.share(file) } }.show().also { styleDialog(it) }
            }
        }, 16)
        val playerCard = ui.card(body)
        ui.add(playerCard, ui.text("그날의 목소리", 24f, true))
        playbackStatus = ui.text("전체 녹음 · 원본 그대로", 18f, color = ui.muted); ui.add(playerCard, playbackStatus, 12)
        position = ui.text("00:00 / 00:00", 20f, true); ui.add(playerCard, position, 16)
        seek = SeekBar(this).apply {
            thumbTintList = android.content.res.ColorStateList.valueOf(ui.blue)
            minimumHeight = ui.dp(56); contentDescription = "전체 녹음 재생 위치"; progressTintList = android.content.res.ColorStateList.valueOf(ui.blue)
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(bar: SeekBar?, value: Int, user: Boolean) {
                    if (user && allowed()) { pendingSeek = value; if (prepared) player?.seekTo(value); position.text = "${time(value.toLong())} / ${time(review.record?.durationMs ?: 0)}" }
                }
                override fun onStartTrackingTouch(bar: SeekBar?) = Unit
                override fun onStopTrackingTouch(bar: SeekBar?) = Unit
            })
        }; ui.add(playerCard, seek, 8)
        play = ui.button("원본 재생", true) { playOriginal() }
        stop = ui.button("재생 종료") { stopPlayback(); playbackStatus.text = "재생을 종료했어요 · 원본은 보관돼 있어요"; render() }
        ui.pair(playerCard, play, stop)
        readBody = ui.column(); ui.add(body, readBody, 16)
        originalBody = ui.column(); ui.add(body, originalBody, 16)
        editBody = ui.column(); ui.add(body, editBody, 16)
        val speechCard = ui.card(editBody, 0)
        ui.add(speechCard, ui.text("말한 내용을 확인해요", 26f, true))
        ui.add(speechCard, ui.text("같은 원본을 글로 옮겨요. 인식이 잘못된 부분은 아래에서 고칠 수 있어요.", color = ui.muted), 12)
        recognize = ui.button("음성을 글로 옮기기") { selected?.let { runSpeech(it) } }; ui.add(speechCard, recognize, 16)
        sttStatus = ui.text("인식 전 · 원본을 듣고 직접 입력해도 돼요.", 18f, color = ui.muted)
        sttStatus.maxLines = 4; sttStatus.ellipsize = android.text.TextUtils.TruncateAt.END
        sttStatus.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE; ui.add(speechCard, sttStatus, 16)
        ui.add(speechCard, ui.button("음성 인식 중단") { speech.cancel(); abandonFocus(); sttStatus.text = "인식을 중단했어요. 원본은 남아 있어요."; render() }, 12)
        review = ReviewPanel(this, editBody, { allowed() }, { !syncBusy && !capture.busy && !speech.busy && player == null },
            { !syncBusy && !capture.busy && !speech.busy }, { render() }, {
                hideKeyboard(); populateDetail(); setTab(0); detail.smoothScrollTo(0, 0)
                status.text = "일기를 저장했어요. 보관함에서 다시 읽고 들을 수 있어요."; refreshLibrary()
            })
        contextBody = ui.column(); ui.add(body, contextBody, 16)
        val photoCard = ui.card(body)
        ui.add(photoCard, ui.text("함께 남긴 사진", 26f, true))
        photoStatus = ui.text("사진은 휴대폰에서 추가해요. 차량에서는 함께 보관된 사진을 볼 수 있어요.\n휴대폰에서 사진을 올린 뒤 보관함의 동기화를 눌러 주세요.", 18f, color = ui.muted); ui.add(photoCard, photoStatus, 12)
        photosBody = ui.column(); ui.add(photoCard, photosBody, 16)
        ui.add(body, ui.button("이 이야기 삭제") { confirmDelete() }, 24)
        return scroll
    }
    private fun openMemory(file: File) {
        if (!allowed() || !idle() || !review.save()) return
        hideKeyboard(); status.text = "이야기를 열고 있어요…"
        val token = ++openGeneration
        Thread({
            val loaded = runCatching { store.load(file) }
            runOnUiThread {
                if (isDestroyed || token != openGeneration || !allowed()) return@runOnUiThread
                loaded.onSuccess { r ->
                    if (review.select(file, r)) {
                        selected = file; screen = Screen.DETAIL; pendingSeek = 0
                        sttStatus.text = if (r.rawHistory.isEmpty()) "인식 전 · 원본을 듣고 직접 입력해도 돼요." else "보관한 인식문이 있어요 · 원본과 비교해 주세요."
                        populateDetail(); setTab(if (r.draft != null && r.accepted == r.revision) 0 else 2)
                        status.text = if (sync.linked(file.name)) "가족 보관함에 공유한 이야기 · 변경 사항은 동기화로 가져와요" else "이 기기에 보관된 이야기 · 공유 전"; detail.scrollTo(0, 0); render()
                    }
                }.onFailure { status.text = "원본 또는 저장 기록을 열지 못했어요. 기존 파일은 그대로 두었어요." }
            }
        }, "memory-open").start()
    }
    private fun populateDetail() {
        val r = review.record ?: return
        detailTitle.text = if (r.speaker.isBlank()) "그날의 이야기" else "${r.speaker}의 이야기"
        detailMeta.text = "${displayDate(r.recordedAt)} · ${time(r.durationMs)} · 이 기기에 보관"
        seek.max = r.durationMs.toInt(); position.text = "${time(pendingSeek.toLong())} / ${time(r.durationMs)}"
        readBody.removeAllViews()
        val card = ui.card(readBody, 0)
        val saved = r.draft != null && r.accepted == r.revision
        ui.add(card, ui.text(if (saved) "이 기기에 저장한 일기" else "아직 완성하지 않은 이야기", 26f, true))
        if (r.draft != null) {
            ui.add(card, ui.text(if (r.generationMode == "mock") "목업 · AI 정리 전" else "AI가 만든 초안", 18f, true, ui.blue), 16)
            if (r.draftRevision != r.revision) ui.add(card, ui.text("수정 전 확인문으로 만든 초안이에요. 다시 생성해 주세요.", color = ui.danger), 16)
            runCatching {
                val groups = JSONObject(r.draft).getJSONArray("groups")
                for (i in 0 until groups.length()) {
                    val group = groups.getJSONObject(i)
                    ui.add(card, ui.text(group.getString("label"), 24f, true), 24)
                    val statements = group.getJSONArray("statements")
                    for (j in 0 until statements.length()) ui.add(card, ui.text(statements.getJSONObject(j).getString("text"), 24f).apply { setTextIsSelectable(true) }, 16)
                    if (group.optBoolean("needs_review")) ui.add(card, ui.text("원본과 비교해 확인할 내용이 있어요.", color = ui.danger), 12)
                }
            }.onFailure { ui.add(card, ui.text("초안을 표시하지 못했어요. 원본은 보관돼 있어요."), 16) }
            if (r.generationMode == "mock") ui.add(card, ui.text("지금은 확인문을 그대로 담아요. 실제 AI 분류·정제는 연결 전이에요.", 18f, color = ui.muted), 24)
        } else ui.add(card, ui.text("원본을 글로 옮긴 뒤 확인하고 일기로 저장해 보세요.", color = ui.muted), 16)
        ui.add(card, ui.button(if (saved) "일기 내용 다시 확인" else "이야기 확인하고 일기 만들기") { setTab(2) }, 24)
        originalBody.removeAllViews()
        val original = ui.card(originalBody, 0)
        ui.add(original, ui.text("처음부터, 그날의 목소리", 26f, true))
        ui.add(original, ui.text("현재 인식은 전체 녹음 한 구간이에요. 문장별 시각은 아직 나누지 않아요.", color = ui.muted), 16)
        ui.add(original, ui.button("00:00부터 원본 듣기") { pendingSeek = 0; if (player != null) stopPlayback(); playOriginal() }, 16)
        ui.add(original, ui.text("00:00 – ${time(r.durationMs)} · ${r.speaker.ifBlank { "화자 확인 전" }}", 18f, true, ui.blue), 24)
        ui.add(original, ui.text(r.rawHistory.lastOrNull() ?: "아직 인식문이 없어요. 내용 확인에서 글로 옮길 수 있어요.", 24f).apply { setTextIsSelectable(true) }, 16)
        if (r.text.isNotBlank() && r.text != r.rawHistory.lastOrNull()) {
            ui.add(original, ui.text("직접 확인한 이야기", 22f, true), 24); ui.add(original, ui.text(r.text, 24f), 12)
        }
        showContext(r.id); loadPhotos(r.id)
    }
    private fun showContext(id: String) {
        contextBody.removeAllViews()
        val card = ui.card(contextBody, 0)
        ui.add(card, ui.text("이 기억을 남긴 차와 장소", 24f, true))
        val result = runCatching { contexts.load(id) }
        val context = result.getOrNull()
        val description = when {
            result.isFailure -> "차량·위치 기록을 읽지 못했어요. 원본 기록은 유지돼요."
            context == null -> "이전 녹음 · 차량 정보와 녹음 위치가 없어요.\n현재 차량이나 위치로 바꾸지 않아요."
            else -> contextDescription(context)
        }
        ui.add(card, ui.text(description, 20f), 16)
    }
    private fun contextDescription(c: MemoryContext): String = buildString {
        append(c.vehicle.label())
        val details = listOf(c.vehicle.type, c.vehicle.year, c.vehicle.plate).filter { it.isNotBlank() }.joinToString(" · ")
        if (details.isNotBlank()) append("\n$details")
        append(if (c.vehicle.source == "synthetic") "\n샘플 차량 · 모의 데이터" else "\n차량 정보: 직접 입력 · 자동 조회 전")
        append(if (c.mockLocation) "\n녹음 시작 위치: 샘플 나들이 주차장 · 모의 위치" else "\n녹음 시작 위치: 미수집 · 위치 연결 전")
        append("\n녹음 시작: ${displayDate(c.startedAt)}")
    }
    private fun setTab(value: Int) {
        if (!allowed() || !review.save()) return
        hideKeyboard(); tab = value
        if (value != 2) populateDetail()
        render()
    }
    private fun buildSettings(): ScrollView {
        val (scroll, body) = page(); settings = scroll
        ui.heading(body, "차량과 사용 안내", "다음 녹음부터 적용해요. 이전 일기의 차량 정보는 그대로 남아요.")
        val card = ui.card(body, 24)
        val profile = vehicle()
        val values = listOf("차 별명" to profile.nickname, "제조사" to profile.brand, "모델" to profile.model,
            "차종" to profile.type, "연식" to profile.year, "차 번호 (선택)" to profile.plate)
        val editors = values.map { (name, value) ->
            val label = ui.text(name, 18f, true); ui.add(card, label, 16)
            ui.input(name).also { edit -> edit.setText(value); edit.filters = arrayOf(android.text.InputFilter.LengthFilter(60)); label.labelFor = edit.id; ui.add(card, edit, 8) }
        }
        val mock = ui.check("샘플 녹음 위치 사용 · 실제 GPS 아님").apply { isChecked = prefs.getBoolean("mock-location", false) }; ui.add(card, mock, 16)
        ui.add(card, ui.text("현재는 차량·위치 API를 연결하지 않았어요. 샘플 위치를 끄면 미수집으로 남겨요. 번호와 위치는 일기 생성 서버에 보내지 않아요.", 18f, color = ui.muted), 16)
        val message = ui.text("직접 입력한 정보는 이 기기에만 저장돼요.", 18f, color = ui.muted)
        ui.add(card, ui.button("차량 정보 저장", true) {
            if (allowed()) {
                val v = editors.map { it.text.toString().trim() }
                val snapshot = VehicleSnapshot(v[0], v[1], v[2], v[3], v[4], v[5])
                if (prefs.edit().putString("profile", snapshot.json().toString()).putBoolean("mock-location", mock.isChecked).commit()) {
                    message.text = "저장했어요. 다음 녹음의 시작 시점에 함께 남겨요."; hideKeyboard()
                } else message.text = "저장하지 못했어요. 다시 시도해 주세요."
            }
        }, 24); ui.add(card, message, 16)
        val info = ui.card(body)
        ui.add(info, ui.text("지금 연결된 기능", 24f, true))
        ui.add(info, ui.text("녹음·원본 재생·기기 내 음성 인식\n목업 일기 생성·이 기기에 저장\n\n실제 주차 신호·위치 자동 수집은 연결 전이에요. 휴대폰 연결은 아래에서 시작해요.", color = ui.muted), 16)
        ui.add(info, ui.button("모의 P 해제 · 사용 잠그기") { parked.isChecked = false }, 24)
        val cloud = ui.card(body)
        ui.add(cloud, ui.text("휴대폰과 같은 보관함", 24f, true))
        ui.add(cloud, ui.text("휴대폰의 차량 연결에서 만든 8자리 코드를 입력해 주세요. 기존 녹음은 직접 공유하기 전까지 이 기기에만 남아요.", 20f, color = ui.muted), 16)
        val code = ui.input("차량 연결 코드").apply { inputType = android.text.InputType.TYPE_CLASS_NUMBER; filters = arrayOf(android.text.InputFilter.LengthFilter(8)) }
        ui.add(cloud, code, 16)
        ui.add(cloud, ui.button("이 차량 연결하기", true) { val value = code.text.toString(); runSync { sync.pair(value); sync.pull() } }, 16)
        ui.add(cloud, ui.button("변경 사항 동기화") { runSync { sync.pull() } }, 16)
        ui.add(cloud, ui.text("연결 해제는 휴대폰에서 할 수 있어요. 해제된 차량이 다시 접속하면 공유 사본을 지워요. 오프라인 삭제는 다음 연결까지 대기해요.", 18f, color = ui.muted), 16)
        return scroll
    }
    private fun runSync(work: () -> Unit) {
        if (!allowed() || !idle() || !review.save()) return
        syncBusy = true; sync.begin(); status.text = "휴대폰 보관함과 연결하고 있어요…"; hideKeyboard(); render()
        Thread({
            val result = runCatching { work() }
            runOnUiThread {
                syncBusy = false
                if (isDestroyed) return@runOnUiThread
                status.text = result.fold({ "동기화했어요. 휴대폰과 차량에서 같은 기록을 볼 수 있어요." }, { it.message ?: "연결하지 못했어요. 다시 시도해 주세요." })
                val file = selected
                if (file != null && !file.exists()) { review.forgetDeleted(); selected = null; screen = Screen.LIBRARY }
                else if (result.isSuccess && file != null && allowed()) openMemory(file)
                refreshLibrary(); render()
            }
        }, "family-vault-sync").start()
    }
    private fun vehicle() = runCatching { VehicleSnapshot.read(JSONObject(prefs.getString("profile", "{}")!!)) }.getOrDefault(VehicleSnapshot())
    private fun navigate(next: Screen) {
        if (!allowed() || !idle() || !review.save()) return
        ++openGeneration; hideKeyboard(); screen = next
        if (next == Screen.LIBRARY) refreshLibrary()
        if (next == Screen.RECORD) { timer.text = "00:00"; captureContext.text = contextDescription(MemoryContext(Instant.now().toString(), vehicle(), prefs.getBoolean("mock-location", false))).substringBefore("\n녹음 시작:") + "\n녹음을 시작하는 순간의 값으로 보관해요." }
        render()
    }
    private fun allowed() = benchAvailable && foreground && ::parked.isInitialized && parked.isChecked && consent.isChecked
    private fun idle() = !syncBusy && !capture.busy && player == null && !speech.busy && (!::review.isInitialized || !review.busy)
    private fun render() {
        if (!initialized) return
        val allowed = allowed()
        gate.visibility = if (allowed) View.GONE else View.VISIBLE
        library.visibility = if (allowed && screen == Screen.LIBRARY) View.VISIBLE else View.GONE
        recording.visibility = if (allowed && screen == Screen.RECORD) View.VISIBLE else View.GONE
        detail.visibility = if (allowed && screen == Screen.DETAIL) View.VISIBLE else View.GONE
        settings.visibility = if (allowed && screen == Screen.SETTINGS) View.VISIBLE else View.GONE
        navigation.forEachIndexed { index, b ->
            b.isEnabled = allowed && idle()
            b.isSelected = when(index) { 0 -> screen == Screen.LIBRARY || screen == Screen.DETAIL; 1 -> screen == Screen.RECORD; else -> screen == Screen.SETTINGS }
            ui.style(b, b.isSelected)
        }
        record.isEnabled = allowed && idle(); finish.isEnabled = allowed && capture.busy
        play.isEnabled = allowed && !syncBusy && selected != null && !capture.busy && !speech.busy && !review.busy
        play.text = if (player != null && prepared) if (player!!.isPlaying) "일시정지" else "이어서 듣기" else "원본 재생"
        stop.isEnabled = player != null
        seek.isEnabled = allowed && !syncBusy && selected != null && !capture.busy && !speech.busy && !review.busy
        recognize.isEnabled = allowed && idle() && selected != null
        readBody.visibility = if (tab == 0) View.VISIBLE else View.GONE
        originalBody.visibility = if (tab == 1) View.VISIBLE else View.GONE
        editBody.visibility = if (tab == 2) View.VISIBLE else View.GONE
        tabs.forEachIndexed { i, button -> ui.style(button, i == tab); button.isSelected = i == tab; button.isEnabled = allowed && !syncBusy && !capture.busy && !speech.busy && !review.busy }
        review.render()
    }
    private fun focus(): Boolean {
        hasFocus = audio.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (!hasFocus) status.text = "오디오를 사용할 수 없어요. 잠시 뒤 다시 시작해 주세요."
        return hasFocus
    }
    private fun abandonFocus() { if (hasFocus) audio.abandonAudioFocusRequest(focusRequest); hasFocus = false }
    private fun startCapture() {
        if (!allowed() || !idle() || !review.save()) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 10); return
        }
        if (!focus()) return
        val snapshot = MemoryContext(Instant.now().toString(), vehicle(), prefs.getBoolean("mock-location", false))
        captureContext.text = contextDescription(snapshot)
        try {
            capture.start(onProgress = { millis -> if (foreground) { timer.text = time(millis); status.text = "녹음 중 · 편하게 이야기해 주세요" } }, onResult = { result ->
                abandonFocus()
                status.text = when {
                    result.error != null -> "원본 보관에 실패했어요. 미완료 파일은 그대로 남겨 두었어요."
                    result.interrupted -> "녹음 중단 · ${time(result.bytes * 1000 / PcmWave.BYTES_PER_SECOND)}까지 보관했어요."
                    else -> "원본을 보관했어요. 이제 이야기를 글로 옮겨 보세요."
                }
                result.file?.let { file ->
                    runCatching {
                        store.save(store.load(file).copy(recordedAt = snapshot.startedAt)); contexts.create(file.name, snapshot)
                    }.onFailure { status.text = "음성은 보관됐지만 차량·시각 저장을 확인해야 해요." }
                    refreshLibrary()
                    if (allowed()) openMemory(file)
                }
                render()
            })
            status.text = "녹음 중 · 자유롭게 이야기해 주세요"
        } catch (_: Exception) { abandonFocus(); status.text = "녹음을 시작하지 못했어요. 마이크 권한과 저장 공간을 확인해 주세요." }
        render()
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code == 10) { status.text = if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) "마이크 권한을 받았어요. 모의 P를 확인하고 녹음을 시작해 주세요." else "마이크 권한이 없어 녹음할 수 없어요."; render() }
    }
    private fun playOriginal() {
        val file = selected ?: return
        if (!allowed() || syncBusy || capture.busy || speech.busy || review.busy) return
        if (player != null) {
            if (!prepared) return
            if (player!!.isPlaying) { player!!.pause(); playbackStatus.text = "일시정지 · 원본 그대로" }
            else if (focus()) { player!!.start(); playbackStatus.text = "보관한 원본 재생 중" }
            render(); return
        }
        if (!focus()) return
        try {
            PcmWave.payloadBytes(file)
            val token = ++playGeneration
            player = MediaPlayer().apply {
                setAudioAttributes(attributes); setDataSource(file.absolutePath)
                setOnPreparedListener {
                    if (token == playGeneration && allowed() && hasFocus) {
                        prepared = true; it.seekTo(pendingSeek); it.start(); playbackStatus.text = "보관한 원본 재생 중 · 전체 녹음"
                        handler.post(ticker); render()
                    } else stopPlayback()
                }
                setOnCompletionListener { stopPlayback(); playbackStatus.text = "원본 재생 완료"; render() }
                setOnErrorListener { _, _, _ -> stopPlayback(); playbackStatus.text = "재생하지 못했어요. 원본은 보관돼 있어요."; render(); true }
                prepareAsync()
            }
            playbackStatus.text = "원본 재생 준비 중"
        } catch (_: Exception) { stopPlayback(); playbackStatus.text = "원본을 재생하지 못했어요. 다시 시도해 주세요." }
        render()
    }
    private fun runSpeech(file: File) {
        if (!allowed() || !idle() || !review.save() || !focus()) return
        speech.run(file, onStatus = { sttStatus.text = it }, onDone = { abandonFocus(); render() },
            onResult = { value -> review.speechResult(file, value) })
        render()
    }
    private fun stopPlayback() {
        playGeneration++; handler.removeCallbacks(ticker); prepared = false
        runCatching { player?.release() }; player = null; pendingSeek = 0
        if (::seek.isInitialized) { seek.progress = 0; position.text = "00:00 / ${time(review.record?.durationMs ?: 0)}" }
        abandonFocus()
    }
    private fun interrupt(message: String) {
        if (!initialized) return
        ++openGeneration
        sync.cancel()
        modal?.dismiss(); modal = null
        review.save(); review.cancel(); capture.stop(true); stopPlayback(); speech.cancel(); abandonFocus()
        status.text = message; playbackStatus.text = "중단됨 · 자동으로 다시 재생하지 않아요"; render()
    }
    private fun loadPhotos(id: String) {
        val token = ++photoGeneration; photosBody.removeAllViews()
        Thread({
            val photos = contexts.photos(id).map { file ->
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeFile(file.path, bounds)
                var sample = 1
                while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 800) sample *= 2
                file to BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample })
            }
            runOnUiThread {
                if (isDestroyed || token != photoGeneration || selected?.name != id) { photos.forEach { it.second?.recycle() }; return@runOnUiThread }
                if (photos.isEmpty()) ui.add(photosBody, ui.text("아직 첨부한 사진이 없어요.", color = ui.muted))
                photos.chunked(2).forEach { pair ->
                    val row = ui.row(); ui.add(photosBody, row, 12)
                    pair.forEachIndexed { index, (file, bitmap) ->
                        val item = ui.column(); row.addView(item, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = ui.dp(12) })
                        val image = ImageView(this).apply { setImageBitmap(bitmap); scaleType = ImageView.ScaleType.CENTER_CROP; contentDescription = "이 일기에 첨부한 사진 ${index + 1}" }
                        item.addView(image, LinearLayout.LayoutParams(-1, ui.dp(160)))
                        ui.add(item, ui.button("사진 크게 보기") { if (allowed() && idle()) showPhoto(file) }, 8)
                        ui.add(item, ui.button("사진 삭제") {
                            if (allowed() && idle()) modal = AlertDialog.Builder(this).setTitle("이 사진을 삭제할까요?")
                                .setMessage("공유 사진은 가족 보관함에서도 삭제해요. 연결되지 않은 기기에는 다음 동기화 때 반영돼요.").setNegativeButton("취소", null)
                                .setPositiveButton("삭제") { _, _ -> if (allowed() && idle()) { if (sync.linked(id)) { selected?.let { original -> runSync { sync.deletePhoto(original, file) } }; return@setPositiveButton }; photoStatus.text = if (contexts.deletePhoto(id, file)) "사진을 삭제했어요." else "삭제하지 못했어요. 다시 시도해 주세요."; loadPhotos(id) } }.show().also { styleDialog(it) }
                        }, 8)
                    }
                }
            }
        }, "memory-photo-thumbnails").start()
    }
    private fun showPhoto(file: File) {
        val image = ImageView(this).apply { setImageBitmap(BitmapFactory.decodeFile(file.path)); adjustViewBounds = true; contentDescription = "첨부 사진 확대" }
        val dialog = AlertDialog.Builder(this).setView(image).setPositiveButton("닫기", null).create()
        modal = dialog; dialog.show(); styleDialog(dialog)
    }
    private fun styleDialog(dialog: AlertDialog) {
        listOf(AlertDialog.BUTTON_POSITIVE, AlertDialog.BUTTON_NEGATIVE).forEach { which ->
            dialog.getButton(which)?.let { button ->
                ui.style(button, which == AlertDialog.BUTTON_POSITIVE)
                button.minimumWidth = ui.dp(144)
            }
        }
        dialog.findViewById<TextView>(android.R.id.message)?.apply { textSize = 20f; setTextColor(ui.ink) }
    }
    private fun confirmDelete() {
        val file = selected ?: return
        if (!allowed() || !idle()) return
        modal = AlertDialog.Builder(this).setTitle("이 이야기를 삭제할까요?")
            .setMessage("원본 음성·일기·확인문·차량 정보·첨부 사진을 함께 삭제해요. 공유한 기록은 가족 보관함에서도 삭제되며, 연결이 필요해요.")
            .setNegativeButton("취소", null).setPositiveButton("삭제") { _, _ ->
                if (allowed() && idle()) {
                    if (sync.linked(file.name)) { runSync { sync.delete(file) }; return@setPositiveButton }
                    if (file.delete()) {
                        store.delete(file.name); contexts.delete(file.name); review.forgetDeleted(); selected = null
                        status.text = "이 이야기를 삭제했어요."; screen = Screen.LIBRARY; refreshLibrary(); render()
                    } else status.text = "원본을 삭제하지 못했어요. 기록을 유지했으니 다시 시도해 주세요."
                }
            }.show().also { styleDialog(it) }
    }
    private fun hideKeyboard() {
        currentFocus?.let { getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(it.windowToken, 0); it.clearFocus() }
    }
    private fun month(value: String?) = runCatching { Instant.parse(value).atZone(zone).format(DateTimeFormatter.ofPattern("yyyy년 M월")) }.getOrNull()
    private fun displayDate(value: String?) = runCatching { Instant.parse(value).atZone(zone).format(date) }.getOrDefault("녹음 시각 확인 필요")
    private fun time(millis: Long) = "%02d:%02d".format(millis / 60000, (millis / 1000) % 60)
    @Deprecated("Platform back handling")
    override fun onBackPressed() {
        if (benchAvailable && allowed() && screen != Screen.LIBRARY && idle()) navigate(Screen.LIBRARY) else super.onBackPressed()
    }
    override fun onResume() { super.onResume(); foreground = true; if (benchAvailable && initialized) render() }
    override fun onPause() {
        foreground = false
        if (benchAvailable && initialized) { interrupt("화면을 벗어나 중단했어요. 모의 P를 다시 확인해 주세요."); parked.isChecked = false }
        super.onPause()
    }
    override fun onDestroy() {
        if (benchAvailable && initialized) { interrupt("화면을 닫았어요."); ++loadGeneration; ++photoGeneration; handler.removeCallbacksAndMessages(null) }
        super.onDestroy()
    }
}
