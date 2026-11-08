package io.hmg.familydiary

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.widget.*
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.CaptureProbe
import io.hmg.familydiary.platform.SpeechProbe
import java.io.File

/** Debug-only bench. Never installed in a real vehicle and never part of pleos release. */
class MainActivity : Activity() {
    private lateinit var capture: CaptureProbe
    private lateinit var speech: SpeechProbe
    private lateinit var status: TextView
    private lateinit var sttStatus: TextView
    private lateinit var parked: CheckBox
    private lateinit var consent: CheckBox
    private lateinit var files: Spinner
    private lateinit var record: Button
    private lateinit var play: Button
    private lateinit var recognize: Button
    private lateinit var checkSdk: Button
    private lateinit var delete: Button
    private lateinit var directory: File
    private lateinit var audio: AudioManager
    private lateinit var focusRequest: AudioFocusRequest
    private var player: MediaPlayer? = null
    private var originals = listOf<File>()
    private var foreground = false
    private var hasFocus = false
    private var benchAvailable = false
    private var playGeneration = 0
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        benchAvailable = BuildConfig.DEBUG && Build.HARDWARE in setOf("ranchu", "goldfish")
        if (!benchAvailable) {
            setContentView(TextView(this).apply { text = "이 실험 앱은 에뮬레이터에서만 실행할 수 있어요." })
            return
        }
        directory = File(filesDir, "capture-probe")
        capture = CaptureProbe(directory)
        speech = SpeechProbe(this)
        audio = getSystemService(AudioManager::class.java)
        focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener { change ->
                if (change != AudioManager.AUDIOFOCUS_GAIN) {
                    hasFocus = false; interrupt("오디오 포커스 상실 · 중단됨")
                }
            }.build()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(40, 24, 40, 40)
        }
        fun label(value: String, size: Float = 20f) = TextView(this).apply {
            text = value; textSize = size; setPadding(0, 8, 0, 8); root.addView(this)
        }
        label("가족의 이야기 · 원본 녹음 실험", 30f)
        label("에뮬레이터 전용 / 실제 주차·차량 신호 미연결\n음성은 이 앱에만 저장됩니다. 서버 전송 없음 · 실험 상한 21분")
        parked = CheckBox(this).apply { text = "모의 P 상태 확인 (실제 차량 판정 아님)"; textSize = 20f; minHeight = 56 }
        consent = CheckBox(this).apply { text = "참여자에게 공동 녹음·보관을 알렸습니다"; textSize = 20f; minHeight = 56 }
        root.addView(parked); root.addView(consent)
        status = label("녹음 대기 · 모의 P와 공동 녹음 안내를 확인해 주세요")
        status.accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
        files = Spinner(this).apply { minimumHeight = 56; contentDescription = "보관된 실험 원본 선택" }
        root.addView(files)
        fun row(): LinearLayout = LinearLayout(this).also { root.addView(it) }
        fun button(row: LinearLayout, title: String, action: () -> Unit): Button = Button(this).apply {
            text = title; textSize = 20f; minimumHeight = 64; isAllCaps = false
            row.addView(this, LinearLayout.LayoutParams(0, -2, 1f).apply { setMargins(0, 4, 12, 4) })
            setOnClickListener { action() }
        }
        val first = row()
        record = button(first, "녹음 시작") { startCapture() }
        button(first, "녹음 마침 / 재생 중지") {
            val wasRecording = capture.busy
            stopEverything(false)
            status.text = if (wasRecording) "중지 요청 · 녹음 파일 보관 중" else "재생·인식 중지됨 · 원본 파일 보존"
            render()
        }
        play = button(first, "선택한 원본 듣기") { playOriginal() }
        val second = row()
        checkSdk = button(second, "STT 연결 확인") { runSpeech(null) }
        recognize = button(second, "같은 원본으로 STT") { selected()?.let { runSpeech(it) } }
        delete = button(second, "실험 원본 전체 삭제") { confirmDelete() }
        sttStatus = label("STT 미실행 · Pleos ON_DEVICE / 저장된 PCM만 사용")
        sttStatus.accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
        parked.setOnCheckedChangeListener { _, checked ->
            if (!checked) interrupt("모의 P 해제 · 기록·재생 중단") else render()
        }
        consent.setOnCheckedChangeListener { _, checked ->
            if (!checked) interrupt("녹음 동의 해제 · 중단") else render()
        }
        setContentView(ScrollView(this).apply { addView(root) })
        refreshFiles()
    }

    private fun allowed() = benchAvailable && foreground && parked.isChecked && consent.isChecked
    private fun idle() = !capture.busy && player == null && !speech.busy
    private fun selected() = originals.getOrNull(files.selectedItemPosition)
    private fun focus(): Boolean {
        hasFocus = audio.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (!hasFocus) status.text = "오디오 사용 권한을 얻지 못했어요. 다시 시작해 주세요."
        return hasFocus
    }
    private fun abandonFocus() { if (hasFocus) audio.abandonAudioFocusRequest(focusRequest); hasFocus = false }
    private fun render() {
        if (!benchAvailable) return
        record.isEnabled = allowed() && idle()
        play.isEnabled = allowed() && idle() && originals.isNotEmpty()
        recognize.isEnabled = allowed() && idle() && originals.isNotEmpty()
        checkSdk.isEnabled = allowed() && idle()
        files.isEnabled = idle()
        delete.isEnabled = idle() && directory.listFiles()?.isNotEmpty() == true
    }
    private fun refreshFiles(prefer: File? = null) {
        originals = directory.listFiles()?.filter { it.name.endsWith(".wav") }
            ?.sortedByDescending { it.lastModified() } ?: emptyList()
        val labels = originals.mapIndexed { index, file ->
            val duration = runCatching { PcmWave.payloadBytes(file) / PcmWave.BYTES_PER_SECOND }.getOrNull()
            (if (file.name.startsWith("synthetic-")) "합성 시험음" else "원본 ${originals.size - index}") + " · ${duration ?: "손상"}초" +
                if (file.name.endsWith(".interrupted.wav")) " · 중단 후 보관" else " · 보관됨"
        }.ifEmpty { listOf("아직 보관된 원본이 없어요") }
        files.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, labels)
        if (prefer != null) files.setSelection(originals.indexOf(prefer).coerceAtLeast(0))
        render()
    }
    private fun startCapture() {
        if (!allowed() || !idle()) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 10); return
        }
        if (!focus()) return
        try {
            capture.start(onProgress = { millis ->
                if (capture.busy && foreground) status.text = "녹음 중 · ${millis / 1000}초 · 편하게 이야기해 주세요"
            }, onResult = { result ->
                abandonFocus()
                status.text = when {
                    result.error != null -> "원본 보관 실패 · ${result.error}\n미완료 파일은 완료 원본으로 표시하지 않습니다."
                    result.interrupted -> "녹음 중단 · ${result.bytes / PcmWave.BYTES_PER_SECOND}초까지 보관됨"
                    else -> "원본 보관 완료 · ${result.bytes / PcmWave.BYTES_PER_SECOND}초 · 다시 들을 수 있어요"
                }
                refreshFiles(result.file)
            })
            status.text = "녹음 중 · 자유롭게 이야기해 주세요"
        } catch (_: Exception) { abandonFocus(); status.text = "녹음 시작 실패 · 마이크 권한·저장 공간을 확인해 주세요" }
        render()
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code == 10) {
            status.text = if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED)
                "마이크 권한 허용됨 · 모의 P를 확인하고 녹음 시작을 눌러 주세요" else "마이크 권한이 없어 녹음할 수 없어요"
            render() // Granting permission never silently starts recording.
        }
    }
    private fun playOriginal() {
        val file = selected() ?: return
        if (!allowed() || !idle() || !focus()) return
        try {
            PcmWave.payloadBytes(file)
            val token = ++playGeneration
            player = MediaPlayer().apply {
                setAudioAttributes(attributes); setDataSource(file.absolutePath)
                setOnPreparedListener {
                    if (token == playGeneration && allowed() && hasFocus) {
                        it.start(); status.text = "보관한 원본 재생 중 · ${it.duration / 1000}초"
                    } else stopPlayback()
                }
                setOnCompletionListener { stopPlayback(); status.text = "원본 재생 완료"; render() }
                setOnErrorListener { _, _, _ -> stopPlayback(); status.text = "재생 실패 · 원본 파일 보존"; render(); true }
                prepareAsync()
            }
            status.text = "원본 재생 준비 중"
        } catch (_: Exception) { stopPlayback(); status.text = "원본 파일을 재생할 수 없어요" }
        render()
    }
    private fun runSpeech(file: File?) {
        if (!allowed() || !idle() || !focus()) return
        speech.run(file, onStatus = { sttStatus.text = it }, onDone = { abandonFocus(); render() })
        render()
    }
    private fun stopPlayback() {
        playGeneration++
        runCatching { player?.release() }; player = null; abandonFocus()
    }
    private fun stopEverything(interrupted: Boolean) {
        capture.stop(interrupted); stopPlayback(); speech.cancel(); abandonFocus()
    }
    private fun interrupt(message: String) {
        stopEverything(true); status.text = message; sttStatus.text = "STT 중단 · 자동 재개하지 않습니다"; render()
    }
    private fun confirmDelete() {
        if (!idle()) return
        AlertDialog.Builder(this).setTitle("실험 원본을 모두 삭제할까요?")
            .setMessage("완료 원본과 미완료 파일을 이 앱에서 삭제합니다.")
            .setNegativeButton("취소", null).setPositiveButton("삭제") { _, _ ->
                if (idle()) {
                    val success = directory.listFiles()?.map { it.delete() }?.all { it } ?: true
                    status.text = if (success) "실험 원본 삭제 완료" else "일부 파일 삭제 실패 · 다시 시도해 주세요"
                    sttStatus.text = "STT 미실행"; refreshFiles()
                }
            }.show()
    }
    override fun onResume() { super.onResume(); foreground = true; if (benchAvailable) render() }
    override fun onPause() {
        foreground = false
        if (benchAvailable) { interrupt("화면을 벗어나 중단됨 · 모의 P를 다시 확인해 주세요"); parked.isChecked = false }
        super.onPause()
    }
    override fun onDestroy() { if (benchAvailable) stopEverything(true); super.onDestroy() }
}
