package io.hmg.familydiary

import android.content.Intent
import android.content.ServiceConnection
import android.content.ComponentName
import android.os.IBinder
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
import io.hmg.familydiary.capture.VehicleInteractionPolicy
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.*
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.io.File

/** Integrated local vehicle prototype; emulator-only. Production Pleos gates remain separate. */
class MainActivity : Activity() {
    private var recordingService:RecordingService?=null
    private var serviceBound=false
    private var signalMotion=VehicleInteractionPolicy.Motion.UNKNOWN
    private var handledRecording:File?=null
    private var pendingCaptureReview:File?=null
    private val recordingConnection=object:ServiceConnection {
        override fun onServiceConnected(name:ComponentName,binder:IBinder){
            val service=(binder as RecordingService.LocalBinder).service
            recordingService=service;capture=service.capture;speech=service.speech
            changingMotion=true;consent.isChecked=service.consent;changingMotion=false
            if(foreground)service.attach(::recordingChanged)
            render()
        }
        override fun onServiceDisconnected(name:ComponentName){recordingService=null;signalMotion=VehicleInteractionPolicy.Motion.UNKNOWN;changingMotion=true;parked.isChecked=false;driving.isChecked=false;changingMotion=false;interrupt("녹음 서비스 연결을 확인해 주세요.")}
    }
    private fun recordingChanged(service:RecordingService){
        if(!initialized || isDestroyed)return
        playbackService?.setSimulation(service.simulation)
        captureElapsed=service.elapsed;captureLevel=service.level
        liveText=service.text;liveStatus=service.speechStatus;liveFile=service.resultFile
        if(signalMotion!=service.motion){
            signalMotion=service.motion
            if(signalMotion==VehicleInteractionPolicy.Motion.UNKNOWN){
                changingMotion=true;parked.isChecked=false;driving.isChecked=false;changingMotion=false
                stopPlayback();modal?.dismiss();review.cancel();render()
            }else changeMotion(signalMotion==VehicleInteractionPolicy.Motion.DRIVING,true)
        }
        parked.text=if(service.simulation==null)service.source else "모의 P 상태 확인 · 시험 상태"
        if(service.resultFile!=null && service.resultFile!=handledRecording){
            handledRecording=service.resultFile
            pendingCaptureReview=service.resultFile
            selected=service.resultFile;review.select(null);review.select(selected,store.load(selected!!))
            screen=Screen.DETAIL;nativeEditor=false;drivingRows=null;drivingHasDiary=null;drivingDiaryRows=null;drivingDiarySummaries.clear()
            status.text=service.notice
            refreshLibrary();if(allowed())exact.review(selected!!.name)
            render()
        }else if(service.resultFile!=null && !service.speech.busy && selected==service.resultFile){
            // Final STT may arrive after WAV completion; reload without replacing unsent web edits.
            val latest=store.load(selected!!)
            if(review.record?.revision!=latest.revision){review.select(null);review.select(selected,latest)}
        }
        if(foreground){exact.state(referenceState());renderDriving();timer.text=time(captureElapsed);welcome.update(recordingService!=null,service.consent && service.motion==VehicleInteractionPolicy.Motion.UNKNOWN)}
    }
    private var playbackService:PlaybackService?=null
    private var playbackBound=false
    private val playbackConnection=object:ServiceConnection {
        override fun onServiceConnected(name:ComponentName,binder:IBinder){
            playbackService=(binder as PlaybackService.LocalBinder).service
            playbackService?.setSimulation(recordingService?.simulation)
            if(foreground)playbackService?.attach(::playbackChanged)
        }
        override fun onServiceDisconnected(name:ComponentName){playbackService=null;player=null;prepared=false;if(initialized)render()}
    }
    private fun playbackChanged(service:PlaybackService){
        if(!initialized || isDestroyed)return
        player=service.player;prepared=service.prepared;completedPlayback=service.completed
        if(service.busy && !service.stopping)listeningSession=true
        if(service.narrating)activeListenMode="diary" else if(service.player!=null)activeListenMode="original"
        if(service.busy && selected!=service.file)service.file?.takeIf { it.isFile }?.let {
            selected=it;review.select(null);review.select(it,store.load(it))
        }
        playbackStatus.text=service.notice
        handler.removeCallbacks(ticker)
        if(foreground){if(service.busy)handler.post(ticker);render()}
    }
    private var drivingListenMode = "diary" // Next explicit selection; independent of the active audio.
    private var activeListenMode = "diary"
    private var listeningSession=false
    private var listenCatalogVersion=0
    private var drivingSwitchGeneration = 0
    private var drivingDiaryRows:List<File>?=null
    private val drivingDiarySummaries=mutableMapOf<File,JSONObject>()
    private enum class Screen { LIBRARY, RECORD, DETAIL, SETTINGS }
    private lateinit var exact: ExactDiaryView
    private lateinit var nativeShell: View
    private lateinit var nativeRail: View
    private lateinit var welcome: WelcomePanel
    private var nativeEditor = false
    private var captureElapsed = 0L
    private var captureLevel = 0f
    private var liveText = ""
    private var liveStatus = ""
    private var liveFile: File? = null
    private var liveApplied = false
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
    private lateinit var driving: CheckBox
    private var drivingRows:List<File>?=null
    private var drivingHasDiary:Boolean?=null
    private var drivingNotice=""
    private var changingMotion=false
    private lateinit var drivingPanel: LinearLayout
    private lateinit var modeSwitch: Button
    private lateinit var drivingStatus: TextView
    private lateinit var drivingTime: TextView
    private lateinit var drivingOriginal: TextView
    private lateinit var drivingRecord: Button
    private lateinit var drivingPause: Button
    private lateinit var drivingFinish: Button
    private lateinit var drivingPlay: Button
    private lateinit var drivingStop: Button
    private lateinit var drivingPrevious: Button
    private lateinit var drivingNext: Button
    private lateinit var gate: View
    private lateinit var library: ScrollView
    private lateinit var recording: ScrollView
    private lateinit var detail: ScrollView
    private lateinit var settings: ScrollView
    private lateinit var themePicker: Spinner
    private lateinit var list: LinearLayout
    private lateinit var connectionTitle: TextView
    private lateinit var connectionDescription: TextView
    private lateinit var connectionFeedback: TextView
    private lateinit var connectionForm: LinearLayout
    private val recordingLocation by lazy { RecordingLocation(this) }
    private val vehicleLookup by lazy { VehicleInfoLookup(this) }
    private var vehicleLookupBusy = false
    private lateinit var vehicleEditors: List<EditText>
    private lateinit var vehicleLookupNotice: TextView
    private lateinit var vehicleLookupButton: Button
    private val vehicleEdited = mutableSetOf<Int>()
    private var applyingVehicleDefaults = false
    private var profileSource = "manual"
    private lateinit var connectionLabel: EditText
    private lateinit var renameButton: Button
    private lateinit var connectionCode: EditText
    private lateinit var connectButton: Button
    private lateinit var syncButton: Button
    private lateinit var chooseMemoryButton: Button
    private lateinit var libraryConnection: TextView
    private lateinit var librarySync: Button
    private var syncNotice = ""
    private var syncFailed = false
    private lateinit var libraryCount: TextView
    private lateinit var search: EditText
    private lateinit var months: Spinner
    private lateinit var record: Button
    private lateinit var finish: Button
    private lateinit var recordIntro: LinearLayout
    private lateinit var recordBadge: TextView
    private lateinit var recentMemory: LinearLayout
    private lateinit var timer: TextView
    private lateinit var captureContext: TextView
    private lateinit var play: Button
    private lateinit var stop: Button
    private lateinit var seek: SeekBar
    private lateinit var position: TextView
    private lateinit var drivingTtsStart:Button
    private lateinit var drivingTtsPrevious:Button
    private lateinit var drivingTtsNext:Button
    private lateinit var drivingTtsStop:Button
    private lateinit var drivingTtsStatus:TextView
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
    private val waveformCache=mutableMapOf<String,org.json.JSONArray>()
    private var completedPlayback=0.0
    private var referencePage=""
    private var nextAutoPull=0L // Retained as an explicit test scheduling barrier.
    private var syncPending=true
    private var syncVersion=-1L
    private val syncEvents by lazy { SyncEvents(this,{sync},{syncPending=true;if(initialized && foreground)exact.state(referenceState())},{message->syncNotice=message;if(initialized && foreground)exact.state(referenceState())}) }
    private val autoPull = object : Runnable {
        override fun run() {
            if(!foreground)return
            if(initialized && syncVersion!=sync.version) {
                syncVersion=sync.version
                if(!sync.uploading)syncPending=true
                cacheVehicleName()
                exact.state(referenceState())
                if(allowed() && idle() && !nativeEditor)exact.refreshSafe()
            }
            if(initialized && sync.revoked && allowed() && idle() && !nativeEditor) {
                runSync("차량 연결을 다시 해 주세요.") { sync.cleanupRevoked() }
            }
            if(initialized && syncPending && allowed() && sync.paired && !sync.uploading && idle() && !nativeEditor && referencePage in setOf("carhome","carlist","cardetail","carsettings") && android.os.SystemClock.elapsedRealtime()>=nextAutoPull) {
                syncPending=false;syncBusy=true;sync.begin();exact.state(referenceState())
                Thread({
                    val result=runCatching { sync.pull() }
                    runOnUiThread {
                        syncBusy=false;syncVersion=sync.version;cacheVehicleName()
                        nextAutoPull=0L
                        if(isDestroyed)return@runOnUiThread
                        syncFailed=result.isFailure
                        syncNotice=if(result.isFailure)result.exceptionOrNull()?.message?:"연결을 다시 확인하고 있어요." else ""
                        if(foreground && allowed()) {
                            val file=selected
                            if(file!=null && !file.exists()) {review.forgetDeleted();selected=null;exact.library()}
                            else if(result.getOrDefault(false) || !sync.paired)exact.refreshSafe()
                            exact.state(referenceState())
                        }
                    }
                },"diary-auto-pull").start()
            }
            if(initialized && sync.paired)syncEvents.start()
            handler.postDelayed(this,1000)
        }
    }
    private val ticker = object : Runnable {
        override fun run() {
            if (prepared) runCatching {
                val p = player ?: return@runCatching
                seek.progress = p.currentPosition
                position.text = "${time(p.currentPosition.toLong())} / ${time(p.duration.toLong())}"
                if(::exact.isInitialized)exact.state(referenceState())
            }
            renderDriving()
            if (foreground && playbackService?.busy==true) handler.postDelayed(this, 250)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        benchAvailable = BuildConfig.EMULATOR_BENCH && Build.HARDWARE in setOf("ranchu", "goldfish")
        if (!benchAvailable) { setContentView(TextView(this).apply { text = "이 버전은 에뮬레이터에서만 실행할 수 있어요." }); return }
        VehicleTheme.rememberSystem(this)
        ui = VehicleTheme(this)
        directory = File(filesDir, "capture-probe")
        store = ReviewStore(File(filesDir, "capture-review"))
        contexts = MemoryContextStore(File(filesDir, "memory-context"))
        sync = CloudSync.get(filesDir)
        SyncUploads.install(this)
        capture = CaptureProbe(directory); speech = SpeechProbe(this)
        audio = getSystemService(AudioManager::class.java)
        focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener { change ->
                if (change != AudioManager.AUDIOFOCUS_GAIN) { hasFocus = false; interrupt("오디오 사용이 중단됐어요. 원본은 보관돼 있어요.") }
            }.build()
        buildShell()
        initialized = true
        refreshLibrary()
        serviceBound=bindService(Intent(this,RecordingService::class.java),recordingConnection,BIND_AUTO_CREATE)
        playbackBound=bindService(Intent(this,PlaybackService::class.java),playbackConnection,BIND_AUTO_CREATE)
    }
    private fun page(): Pair<ScrollView, LinearLayout> {
        val body = ui.column().apply { setPadding(ui.dp(32), ui.dp(32), ui.dp(32), ui.dp(40)); isFocusableInTouchMode = true }
        return ScrollView(this).apply { isFillViewport = true; addView(body) } to body
    }
    private fun buildShell() {
        val wide = resources.configuration.screenWidthDp >= 850
        val shell = LinearLayout(this).apply { orientation = if (wide) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; background=ui.shape(ui.bg,0) }
        val rail = ui.column().apply { setPadding(ui.dp(12), ui.dp(28), ui.dp(12), ui.dp(20)); background=ui.shape(ui.surface,0) }
        rail.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_chagok_logo)
            contentDescription = "차곡차곡"
        }, LinearLayout.LayoutParams(ui.dp(56), ui.dp(56)).apply { gravity = Gravity.CENTER_HORIZONTAL })
        val navParent = if (wide) rail else ui.row().also { ui.add(rail, it, 12) }
        navigation = listOf(
            ui.button("일기") { navigate(Screen.LIBRARY) }.apply { contentDescription = "이야기 보관함" },
            ui.button("녹음", true) { navigate(Screen.RECORD) }.apply { contentDescription = "새 이야기" },
            ui.button("설정") { navigate(Screen.SETTINGS) }.apply { contentDescription = "차량과 사용 안내" }
        )
        listOf(navigation[1], navigation[0], navigation[2]).forEachIndexed { index, button ->
            if (wide && index == 2) rail.addView(View(this), LinearLayout.LayoutParams(1, 0, 1f))
            if (wide) ui.add(navParent, button, 16)
            else navParent.addView(button, LinearLayout.LayoutParams(0, -2, 1f).apply { marginEnd = ui.dp(8) })
        }
        val railView: View = if (wide) ScrollView(this).apply { isFillViewport = true; addView(rail) } else rail
        nativeRail=railView
        shell.addView(railView, if (wide) LinearLayout.LayoutParams(ui.dp(112), -1) else LinearLayout.LayoutParams(-1, -2))
        val main = ui.column()
        status = ui.text("주차 상태와 공동 녹음 안내를 확인해 주세요.", 14f, color = ui.muted).apply {
            setPadding(ui.dp(32), ui.dp(8), ui.dp(32), ui.dp(8)); background=ui.shape(ui.bg,0)
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        main.addView(status, LinearLayout.LayoutParams(-1, -2))
        val frame = FrameLayout(this)
        main.addView(frame, LinearLayout.LayoutParams(-1, 0, 1f))
        shell.addView(main, if (wide) LinearLayout.LayoutParams(0, -1, 1f) else LinearLayout.LayoutParams(-1, 0, 1f))
        fun attach(view: View) { frame.addView(view, FrameLayout.LayoutParams(-1, -1)) }
        // Backing state controls are retained for the shared motion/access code, not displayed.
        parked = ui.check("주차 상태")
        consent = ui.check("공동 녹음 안내 확인")
        driving = ui.check("주행 상태")
        welcome=WelcomePanel(this,ui,{ beginWelcome() },{ finish() },{
            val modes=listOf("auto","light","dark")
            VehicleTheme.select(this,modes[(modes.indexOf(VehicleTheme.mode(this))+1)%modes.size])
            applyAppearance()
        })
        gate=welcome
        attach(gate)
        buildLibrary().also { attach(it) }
        buildRecording().also { attach(it) }
        buildDetail().also { attach(it) }
        buildSettings().also { attach(it) }
        parked.setOnCheckedChangeListener { _, checked ->
            if(!changingMotion){
                if(checked)changeMotion(false)
                else if(!driving.isChecked){recordingService?.setSimulation(VehicleInteractionPolicy.Motion.UNKNOWN);interrupt("차량 상태를 확인할 수 없어 중단했어요.")}
                render()
            }
        }
        driving.setOnCheckedChangeListener { _, checked ->
            if(!changingMotion){if(checked)changeMotion(true) else if(!parked.isChecked){recordingService?.setSimulation(VehicleInteractionPolicy.Motion.UNKNOWN);interrupt("차량 상태를 확인할 수 없어 중단했어요.")};render()}
        }
        consent.setOnCheckedChangeListener { _, checked -> if(!changingMotion)recordingService?.setConsent(checked); if (!checked) interrupt("공동 녹음 안내 해제 · 중단했어요.") else render() }
        nativeShell=shell
        exact=ExactDiaryView(this, { request, reply -> referenceCommand(request,reply) }, { id,name ->
            if(!allowed()) null else runCatching { contexts.photos(id).firstOrNull { it.name==name } }.getOrNull()
        })
        val container=FrameLayout(this);container.addView(shell,FrameLayout.LayoutParams(-1,-1));container.addView(exact,FrameLayout.LayoutParams(-1,-1));exact.visibility=View.GONE
        drivingPanel=buildDrivingPanel()
        container.addView(drivingPanel,FrameLayout.LayoutParams(-1,-1))
        modeSwitch=ui.button("시험: 주행으로 전환") {changeMotion(parked.isChecked)}.apply { textSize=13f;minHeight=ui.dp(44) }
        container.addView(modeSwitch,FrameLayout.LayoutParams(-2,ui.dp(44),Gravity.TOP or Gravity.END).apply{topMargin=ui.dp(8);rightMargin=ui.dp(12)})
        drivingPanel.visibility=View.GONE;modeSwitch.visibility=View.GONE
        setContentView(container)
    }
    private fun beginWelcome() {
        val service=recordingService ?: return
        if(!foreground || !benchAvailable || !welcome.accepted || !idle() || service.consent)return
        // This explicit entry action supplies the emulator's initial state only.
        // Later UNKNOWN events never restore P automatically; known motion is preserved.
        if(service.motion==VehicleInteractionPolicy.Motion.UNKNOWN) {
            if(service.simulation!=null)return
            service.setSimulation(VehicleInteractionPolicy.Motion.PARKED)
        }
        screen=Screen.RECORD;nativeEditor=false
        consent.isChecked=true
        welcome.reset()
        render()
        if(allowed())exact.restore("carhome",null)
    }
    private fun changeMotion(toDriving:Boolean,fromSignal:Boolean=false) {
        if(!benchAvailable || (!fromSignal && recordingService==null))return
        if(!fromSignal){recordingService?.setSimulation(if(toDriving)VehicleInteractionPolicy.Motion.DRIVING else VehicleInteractionPolicy.Motion.PARKED);signalMotion=if(toDriving)VehicleInteractionPolicy.Motion.DRIVING else VehicleInteractionPolicy.Motion.PARKED}
        playbackService?.setSimulation(recordingService?.simulation)
        changingMotion=true
        driving.isChecked=toDriving;parked.isChecked=!toDriving
        changingMotion=false
        if(toDriving) {
            drivingRows=null;drivingHasDiary=null;drivingDiaryRows=null;drivingDiarySummaries.clear()
            if(!sync.uploading)sync.cancel();modal?.dismiss();modal=null
            hideKeyboard();review.save();review.cancel()
            if(!capture.busy && speech.busy && recordingService?.settling!=true)speech.cancel()
            nativeEditor=false
            if(selected==null)directory.listFiles()?.filter { it.extension=="wav" }?.maxByOrNull { runCatching{store.load(it).recordedAt}.getOrDefault("") }?.let { f->review.select(f,store.load(f));selected=f }
        }
        render()
        if(!toDriving && allowed()) {
            if(capture.busy)exact.restore("recording",null)
            else pendingCaptureReview?.takeIf { it.isFile }?.let { file ->
                val r=store.load(file)
                if(r.accepted==r.revision && r.draft!=null)exact.restore("cardetail",file.name) else exact.restore("carreview",file.name)
            } ?: run {screen=Screen.RECORD;nativeEditor=false;exact.restore("carhome",null)}
        }
    }
    private fun buildDrivingPanel():LinearLayout {
        val panel=ui.column().apply{background=ui.shape(ui.bg,0);setPadding(ui.dp(48),ui.dp(64),ui.dp(48),ui.dp(24));gravity=Gravity.CENTER_VERTICAL}
        ui.add(panel,ui.text("차곡 · 음성 모드",28f,true))
        drivingStatus=ui.text("목소리로 기록하고, 원본으로 다시 들어요.",20f,color=ui.muted);ui.add(panel,drivingStatus,12)
        drivingTime=ui.text("00:00",40f,true);ui.add(panel,drivingTime,16)
        val recordingRow=ui.row()
        drivingRecord=ui.button("녹음 시작",true){startCapture()}
        drivingPause=ui.button("녹음 일시정지"){recordingService?.pauseOrResume();renderDriving()}
        drivingFinish=ui.button("녹음 마치기"){recordingService?.finish()}
        listOf(drivingRecord,drivingPause,drivingFinish).forEach { b->recordingRow.addView(b,LinearLayout.LayoutParams(0,ui.dp(72),1f).apply{marginEnd=ui.dp(12)}) }
        ui.add(panel,recordingRow,12)
        drivingOriginal=ui.text("선택한 녹음 없음",20f,color=ui.muted);ui.add(panel,drivingOriginal,28)
        val playbackRow=ui.row()
        drivingPrevious=ui.button("이전 녹음"){selectDrivingOriginal(1)}
        drivingPlay=ui.button("원본 듣기",true){playOriginal()}
        drivingStop=ui.button("재생 종료"){stopPlayback();render()}
        drivingNext=ui.button("다음 녹음"){selectDrivingOriginal(-1)}
        listOf(drivingPrevious,drivingPlay,drivingStop,drivingNext).forEach { b->playbackRow.addView(b,LinearLayout.LayoutParams(0,ui.dp(72),1f).apply{marginEnd=ui.dp(12)}) }
        ui.add(panel,playbackRow,12)
        drivingTtsStatus=ui.text("완성 일기 듣기",20f,color=ui.muted);ui.add(panel,drivingTtsStatus,24)
        val ttsRow=ui.row()
        drivingTtsPrevious=ui.button("이전 일기"){playbackService?.previousNarration()}
        drivingTtsStart=ui.button("일기 듣기",true){runCatching { startDrivingNarration() }.onFailure{drivingNotice=it.message.orEmpty();renderDriving()}}
        drivingTtsStop=ui.button("듣기 종료"){stopPlayback();render()}
        drivingTtsNext=ui.button("다음 일기"){playbackService?.nextNarration()}
        listOf(drivingTtsPrevious,drivingTtsStart,drivingTtsStop,drivingTtsNext).forEach { b->ttsRow.addView(b,LinearLayout.LayoutParams(0,ui.dp(72),1f).apply{marginEnd=ui.dp(12)}) }
        ui.add(panel,ttsRow,12)
        ui.add(panel,ui.text("문장 수정·사진·일기 확인은 주차 후에 할 수 있어요.",18f,color=ui.muted),24)
        return panel
    }
    private fun drivingOriginals():List<File> = drivingRows ?: (directory.listFiles()?.filter {it.extension=="wav"}?.sortedWith(compareByDescending<File> {runCatching{store.load(it).recordedAt}.getOrDefault("")}.thenBy {it.name})?:emptyList()).also{drivingRows=it}
    private fun selectDrivingOriginal(step:Int) {
        if(!audioAllowed() || capture.busy || speech.busy || syncBusy || review.busy)return
        val rows=drivingOriginals();val index=rows.indexOf(selected)
        val next=rows.getOrNull(if(index<0)0 else index+step)?:return
        stopPlayback();review.save();review.select(next,store.load(next));selected=next;renderDriving()
    }
    private fun renderDriving() {
        if(!::drivingPanel.isInitialized)return
        val active=audioAllowed() && driving.isChecked
        drivingPanel.visibility=View.GONE // Controls retained as native command handlers; visible surface uses the reference design.
        if(!active)return
        drivingStatus.text=when {capture.busy->if(capture.paused)"녹음 일시정지" else "녹음 중";speech.busy->"녹음을 보관했어요. 이야기를 글로 옮기고 있어요.";prepared->if(player?.isPlaying==true)"원본 듣는 중" else "재생 일시정지";playbackService?.busy==true->playbackService?.notice.orEmpty();else->playbackService?.notice?.takeIf { it.isNotBlank() } ?: drivingNotice.ifBlank{"녹음한 이야기는 주차 후 확인할 수 있어요."}}
        drivingTime.text=if(capture.busy)time(captureElapsed) else if(prepared)"${time(runCatching{player?.currentPosition?.toLong()?:0L}.getOrDefault(0L))} / ${time(review.record?.durationMs?:0)}" else if(playbackService?.narrating==true) "${playbackService!!.queueIndex+1} / ${playbackService!!.queueCount}" else time(completedPlayback.times(1000).toLong())
        drivingRecord.isEnabled=idle();drivingPause.isEnabled=capture.busy;drivingFinish.isEnabled=capture.busy
        drivingPause.text=if(capture.paused)"녹음 이어가기" else "녹음 일시정지"
        val canPlay=!capture.busy && !speech.busy && !syncBusy && !review.busy && selected!=null
        drivingPlay.isEnabled=canPlay;drivingStop.isEnabled=playbackService?.busy==true
        drivingPlay.text=if(prepared && player?.isPlaying==true)"일시정지" else "원본 듣기"
        drivingOriginal.text=selected?.let {"선택한 녹음 · "+displayDate(review.record?.recordedAt)}?:"선택한 녹음 없음"
        val rows=drivingOriginals();val index=rows.indexOf(selected)
        drivingPrevious.isEnabled=canPlay && index>=0 && index<rows.lastIndex
        drivingNext.isEnabled=canPlay && index>0
        val tts=playbackService
        drivingTtsStatus.text=if(tts?.narrating==true)"일기 이어 듣기 · ${tts.queueIndex+1}/${tts.queueCount}" else "완성 일기 듣기"
        drivingTtsStart.isEnabled=idle() && (drivingHasDiary ?: drivingOriginals().any { narrationItem(it)!=null }.also {drivingHasDiary=it})
        drivingTtsPrevious.isEnabled=tts?.hasPrevious==true
        drivingTtsNext.isEnabled=tts?.hasNext==true
        drivingTtsStop.isEnabled=tts?.narrating==true
    }
    private fun buildLibrary(): ScrollView {
        val (scroll, body) = page(); library = scroll
        ui.heading(body, "우리 가족의 일기", "차 안에서 함께 남긴 이야기와 목소리")
        val header = ui.card(body, 24)
        libraryCount = ui.text("보관한 이야기를 불러오고 있어요", 20f, true); ui.add(header, libraryCount)
        libraryConnection = ui.text("", 16f, true, ui.blue); ui.add(header, libraryConnection, 8)
        librarySync = ui.button("휴대폰과 동기화") { if (sync.paired) runSync { SyncUploads.request(this,sync);sync.pull() } else navigate(Screen.SETTINGS) }
        ui.pair(header, librarySync, ui.button("새 이야기 녹음하기", true) { navigate(Screen.RECORD) })
        val filters = ui.row(); ui.add(body, filters, 20)
        search = ui.input("날짜·이야기 검색").apply { hint = "기억나는 말이나 날짜로 찾기" }
        filters.addView(search, LinearLayout.LayoutParams(0,-2,1f).apply { marginEnd=ui.dp(16) })
        months = Spinner(this).apply { minimumHeight = ui.dp(64); contentDescription = "기록 연월 선택"; background = ui.shape(ui.surface) }
        filters.addView(months, LinearLayout.LayoutParams(ui.dp(200),-2))
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
        drivingRows=null;drivingHasDiary=null;drivingDiaryRows=null;drivingDiarySummaries.clear()
        val token = ++loadGeneration
        Thread({
            val data = directory.listFiles()?.filter { it.name.endsWith(".wav") }?.map { file -> file to runCatching { store.load(file) }.getOrNull() }
                ?.sortedByDescending { it.second?.recordedAt ?: Instant.ofEpochMilli(it.first.lastModified()).toString() } ?: emptyList()
            runOnUiThread {
                if (isDestroyed || token != loadGeneration) return@runOnUiThread
                entries = data
                val previous = monthKeys.getOrNull(months.selectedItemPosition)
                monthKeys = listOf("전체 기간") + data.mapNotNull { month(it.second?.recordedAt) }.distinct()
                months.adapter = object : ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item, monthKeys) {
                    override fun getView(position: Int, convertView: View?, parent: android.view.ViewGroup): View = super.getView(position, convertView, parent).also { (it as TextView).setTextColor(ui.ink) }
                    override fun getDropDownView(position: Int, convertView: View?, parent: android.view.ViewGroup): View = super.getDropDownView(position, convertView, parent).also { (it as TextView).setTextColor(ui.ink); it.setBackgroundColor(ui.surface) }
                }
                months.setSelection(monthKeys.indexOf(previous).coerceAtLeast(0)); fillLibrary(); renderRecentMemory()
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
        var row: LinearLayout? = null
        var count = 0
        val wide = resources.configuration.screenWidthDp >= 850
        data.forEach { (file, r) ->
            val key = month(r?.recordedAt) ?: "날짜 확인 필요"
            if (key != previous) { ui.add(list, ui.text(key, 24f, true), 24); previous = key; count = 0 }
            if (count % (if (wide) 3 else 1) == 0) { row = ui.row().apply { gravity = Gravity.TOP }; ui.add(list, row!!, 16) }
            val title = r?.draft?.let { runCatching { JSONObject(it).getJSONArray("groups").optJSONObject(0)?.optString("label") }.getOrNull() }?.takeIf { it.isNotBlank() }
                ?: r?.text?.trim()?.take(48)?.ifBlank { null } ?: "아직 글로 옮기지 않은 이야기"
            val day = runCatching { Instant.parse(r?.recordedAt).atZone(zone).format(DateTimeFormatter.ofPattern("dd  E요일")) }.getOrDefault("날짜 확인")
            val state = if (r?.draft != null && r.accepted == r.revision) "저장한 일기" else "일기 작성 전"
            val button = ui.button("$day\n\n$title\n\n녹음 ${time(r?.durationMs ?: 0)} · $state") { openMemory(file) }.apply {
                gravity = Gravity.START or Gravity.TOP; textSize=22f; minHeight=ui.dp(224); setLineSpacing(ui.dp(4).toFloat(), 1.1f)
                tag = "memory:${file.name}"; isEnabled = r != null
            }
            row!!.addView(button, LinearLayout.LayoutParams(if(wide) 0 else -1,-2,if(wide) 1f else 0f).apply { if(wide) marginEnd=ui.dp(12) })
            count++
        }
        if (wide && count % 3 != 0) repeat(3 - count % 3) { row?.addView(View(this), LinearLayout.LayoutParams(0,1,1f).apply { marginEnd=ui.dp(12) }) }
    }
    private fun renderRecentMemory() {
        if (!::recentMemory.isInitialized) return
        recentMemory.removeAllViews()
        ui.add(recentMemory, ui.text("지난 일기", 24f, true))
        val entry = entries.firstOrNull { it.second != null }
        if (entry == null) {
            ui.add(recentMemory, ui.text("아직 남긴 이야기가 없어요.\n오늘의 목소리부터 차곡차곡 담아 보세요.", 22f, color=ui.muted), 32)
        } else {
            val r = entry.second!!
            val card = ui.card(recentMemory, 24)
            ui.add(card, ui.text(displayDate(r.recordedAt), 18f, color=ui.muted))
            ui.add(card, ui.text(r.text.ifBlank { "아직 글로 옮기지 않은 이야기" }.take(140), 24f, true), 20)
            ui.add(card, ui.text("녹음 ${time(r.durationMs)}", 18f, color=ui.muted), 20)
            ui.add(card, ui.button("지난 일기 열기") { openMemory(entry.first) }, 24)
        }
        ui.add(recentMemory, ui.button("모든 일기 보기") { navigate(Screen.LIBRARY) }, 24)
    }
    private fun buildRecording(): ScrollView {
        val (scroll, body) = page(); recording = scroll
        val wide = resources.configuration.screenWidthDp >= 850
        val columns = LinearLayout(this).apply { orientation=if(wide) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; gravity=Gravity.TOP }
        ui.add(body, columns)
        val primary=ui.column(); val side=ui.column()
        columns.addView(primary, LinearLayout.LayoutParams(if(wide) 0 else -1,-2,if(wide) 1.6f else 0f).apply { if(wide) marginEnd=ui.dp(36) })
        columns.addView(side, LinearLayout.LayoutParams(if(wide) 0 else -1,-2,if(wide) 1f else 0f))
        recordBadge=ui.text("주차 후 녹음 준비",18f,true,ui.blue); ui.add(primary,recordBadge)
        recordIntro=ui.column(); ui.add(primary,recordIntro,72)
        ui.add(recordIntro,ui.text("오늘 가는 길의 이야기,\n담아 둘까요?",44f,true))
        ui.add(recordIntro,ui.text("차 안의 대화를 담고, 오늘의 일기로 남겨요.",22f,color=ui.muted),20)
        timer = ui.text("00:00", 88f, true).apply { setPadding(0,ui.dp(64),0,ui.dp(64)); typeface=android.graphics.Typeface.create("sans-serif",android.graphics.Typeface.BOLD) }; ui.add(primary,timer)
        record = ui.button("녹음 시작", true) { startCapture() }.apply { textSize=30f; minHeight=ui.dp(100); background=ui.shape(ui.coral,32); setTextColor(0xff151923.toInt()) }
        finish = ui.button("끝내고 이야기 확인",true) { if (capture.busy) { recordingService?.finish(); finish.isEnabled = false; status.text = "원본을 보관하고 있어요…" } }.apply { textSize=26f;minHeight=ui.dp(96) }
        ui.add(primary,record,64); ui.add(primary,finish,24)
        ui.add(primary,ui.text("직접 시작한 동안만 녹음해요 · 최대 21분",16f,color=ui.muted),16)
        recentMemory=ui.column(); ui.add(side,recentMemory)
        val context=ui.card(side,24)
        ui.add(context,ui.text("이 기억과 함께 남는 것",20f,true))
        captureContext=ui.text("",18f,color=ui.muted);ui.add(context,captureContext,16)
        ui.add(context,ui.button("차량 정보 설정") { navigate(Screen.SETTINGS) },16)
        return scroll
    }
    private fun buildDetail(): ScrollView {
        val (scroll, body) = page(); detail = scroll
        val wide=resources.configuration.screenWidthDp>=850
        val columns = LinearLayout(this).apply { orientation=if(wide) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL; gravity=Gravity.TOP }
        ui.add(body,columns)
        val storyColumn=ui.column(); val mediaColumn=ui.column()
        columns.addView(storyColumn,LinearLayout.LayoutParams(if(wide) 0 else -1,-2,if(wide) 1.8f else 0f).apply { if(wide) marginEnd=ui.dp(32) })
        columns.addView(mediaColumn,LinearLayout.LayoutParams(if(wide) 0 else -1,-2,if(wide) 1f else 0f))
        val toolbar=ui.row();ui.add(storyColumn,toolbar)
        toolbar.addView(ui.button("보관함으로") { navigate(Screen.LIBRARY) },LinearLayout.LayoutParams(-2,-2))
        toolbar.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
        detailMeta=ui.text("",18f,color=ui.muted);ui.add(storyColumn,detailMeta,24)
        detailTitle=ui.text("그날의 이야기",36f,true);ui.add(storyColumn,detailTitle,16)
        val tabRow=ui.row();ui.add(storyColumn,tabRow,24)
        tabs=listOf("일기 읽기","원래 이야기","내용 확인").mapIndexed { i,title -> ui.button(title) { setTab(i) }.also { tabRow.addView(it,LinearLayout.LayoutParams(0,-2,1f).apply { marginEnd=ui.dp(8) }) } }
        val photoCard=ui.card(mediaColumn,0)
        ui.add(photoCard,ui.text("함께 남긴 사진",22f,true))
        photoStatus=ui.text("사진은 휴대폰에서 추가하고 동기화해 주세요.",16f,color=ui.muted);ui.add(photoCard,photoStatus,12)
        photosBody=ui.column();ui.add(photoCard,photosBody,16)
        val playerCard = ui.card(mediaColumn,24)
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
        ui.add(playerCard,play,16);ui.add(playerCard,stop,12)
        readBody = ui.column(); ui.add(storyColumn, readBody,24)
        originalBody = ui.column(); ui.add(storyColumn, originalBody,24)
        editBody = ui.column(); ui.add(storyColumn, editBody,24)
        val speechCard = ui.card(editBody, 0)
        ui.add(speechCard, ui.text("말한 내용을 확인해요", 26f, true))
        ui.add(speechCard, ui.text("같은 원본을 글로 옮겨요. 인식이 잘못된 부분은 아래에서 고칠 수 있어요.", color = ui.muted), 12)
        recognize = ui.button("음성을 글로 옮기기") { selected?.let { runSpeech(it) } }; ui.add(speechCard, recognize, 16)
        sttStatus = ui.text("인식 전 · 원본을 듣고 직접 입력해도 돼요.", 18f, color = ui.muted)
        sttStatus.maxLines = 4; sttStatus.ellipsize = android.text.TextUtils.TruncateAt.END
        sttStatus.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE; ui.add(speechCard, sttStatus, 16)
        ui.add(speechCard, ui.button("음성 인식 중단") { speech.cancel(); abandonFocus(); sttStatus.text = "인식을 중단했어요. 원본은 남아 있어요."; render() }, 12)
        review = ReviewPanel(this, editBody, { allowed() }, { !syncBusy && !capture.busy && !speech.busy && playbackService?.busy!=true },
            { !syncBusy && !capture.busy && !speech.busy }, { render() }, {
                selected?.let { sync.capture(it) };SyncUploads.request(this,sync)
                nativeEditor=false; hideKeyboard(); populateDetail(); setTab(0); detail.smoothScrollTo(0, 0); selected?.let { exact.memory(it.name) }
                status.text = "일기를 저장했어요. 보관함에서 다시 읽고 들을 수 있어요."; refreshLibrary()
            })
        contextBody = ui.column(); ui.add(mediaColumn, contextBody, 24)
        ui.add(storyColumn, ui.button("이 이야기 삭제") { confirmDelete() }, 24)
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
                        status.text = if (sync.paired) "완성한 일기는 가족 보관함과 자동으로 동기화해요" else "이 기기에 보관된 이야기 · 휴대폰 연결 필요"; detail.scrollTo(0, 0); render()
                    }
                }.onFailure { status.text = "원본 또는 저장 기록을 열지 못했어요. 기존 파일은 그대로 두었어요." }
            }
        }, "memory-open").start()
    }
    private fun populateDetail() {
        val r = review.record ?: return
        detailTitle.text = r.draft?.let { runCatching { JSONObject(it).getJSONArray("groups").optJSONObject(0)?.optString("label") }.getOrNull() }?.takeIf { it.isNotBlank() } ?: if (r.speaker.isBlank()) "그날의 이야기" else "${r.speaker}의 이야기"
        detailMeta.text = "${displayDate(r.recordedAt)} · ${time(r.durationMs)} · 이 기기에 보관"
        seek.max = r.durationMs.toInt(); position.text = "${time(pendingSeek.toLong())} / ${time(r.durationMs)}"
        readBody.removeAllViews()
        val card = ui.column().also { ui.add(readBody,it) }
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
        if (c.vehicle.source == "emulator_assisted") append("\n에뮬레이터 조회 후 확인한 정보 · 실제 차량 아님")
        if (c.vehicle.source == "vehicle_assisted") append("\n차량 조회 후 확인·수정한 정보")
        val details = listOf(c.vehicle.type, c.vehicle.year, c.vehicle.plate).filter { it.isNotBlank() }.joinToString(" · ")
        if (details.isNotBlank()) append("\n$details")
        if(c.vehicle.source == "synthetic") append("\n샘플 차량 · 모의 데이터") else if(c.vehicle.source == "manual") append("\n차량 정보: 직접 입력")
        append("\n녹음 시작 위치: ${c.location.label()}" + if(c.location.source=="pleos_fused_emulator")" · 에뮬레이터 관측" else "")
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
        val appearance=ui.card(body)
        ui.add(appearance,ui.text("화면 설정",26f,true))
        val modeLabel=ui.text("화면 모드",20f);ui.add(appearance,modeLabel,16)
        val modes=listOf("auto","light","dark")
        val picker=Spinner(this).apply { id=View.generateViewId();contentDescription="화면 모드";minimumHeight=ui.dp(64) }
        modeLabel.labelFor=picker.id
        val adapter=object:ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,listOf("자동 · 차량 설정 따름","라이트","다크")) {
            override fun getView(position:Int,convertView:View?,parent:android.view.ViewGroup):View=super.getView(position,convertView,parent).also { ui.textColor(it as TextView,ui.ink);it.background=ui.shape(ui.surface,0) }
            override fun getDropDownView(position:Int,convertView:View?,parent:android.view.ViewGroup):View=getView(position,convertView,parent)
        }
        themePicker=picker;picker.adapter=adapter;picker.setSelection(modes.indexOf(VehicleTheme.mode(this)));ui.add(appearance,picker,8)
        picker.onItemSelectedListener=object:AdapterView.OnItemSelectedListener {
            override fun onNothingSelected(parent:AdapterView<*>?)=Unit
            override fun onItemSelected(parent:AdapterView<*>?,view:View?,position:Int,id:Long) {
                if(modes[position]==VehicleTheme.mode(this@MainActivity))return
                if(!allowed()){picker.setSelection(modes.indexOf(VehicleTheme.mode(this@MainActivity)));return}
                VehicleTheme.select(this@MainActivity,modes[position]);applyAppearance();adapter.notifyDataSetChanged()
            }
        }
        ui.add(appearance,ui.text("자동은 차량 시스템의 주간·야간 설정을 따라요.",18f,color=ui.muted),8)

        ui.heading(body, "차량과 사용 안내", "휴대폰 연결을 확인하고, 우리 차의 정보를 남겨요.")
        buildConnectionCard(body)
        val card = ui.card(body, 24)
        val profile = vehicle()
        profileSource = profile.source
        val values = listOf("차 별명" to profile.nickname, "제조사" to profile.brand, "모델" to profile.model,
            "차종" to profile.type, "연식" to profile.year, "차 번호 (선택)" to profile.plate)
        val editors = values.map { (name, value) ->
            val label = ui.text(name, 18f, true); ui.add(card, label, 16)
            ui.input(name).also { edit -> edit.setText(value); edit.filters = arrayOf(android.text.InputFilter.LengthFilter(60)); label.labelFor = edit.id; ui.add(card, edit, 8) }
        }
        vehicleEditors = editors
        editors.forEachIndexed { index, edit -> edit.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { if (!applyingVehicleDefaults) vehicleEdited.add(index) }
            override fun afterTextChanged(s: android.text.Editable?) = Unit
        }) }
        vehicleLookupNotice = ui.text("지원되는 제조사·모델·연식을 자동으로 제안해요. 별명·차종·번호는 직접 입력할 수 있어요.", 18f, color = ui.muted).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        ui.add(card, vehicleLookupNotice, 16)
        vehicleLookupButton = ui.button("차량 정보 다시 조회") { if (allowed() && idle()) loadVehicleDefaults() }; ui.add(card, vehicleLookupButton, 12)
        val mock = ui.check("샘플 녹음 위치 사용 · 실제 GPS 아님").apply { isChecked = prefs.getBoolean("mock-location", false) }; ui.add(card, mock, 16)
        ui.add(card, ui.button("녹음 위치 사용 설정") {if(allowed() && idle())requestRecordingLocation()},12)
        ui.add(card, ui.text("권한을 허용하면 녹음 시작 직전의 위치를 함께 보관해요. 조회 실패 시 위치 없이 녹음하며, 번호와 좌표는 일기 생성 AI에 보내지 않아요.", 18f, color = ui.muted), 16)
        val message = ui.text("확인한 차량 정보는 다음 녹음에 함께 남고, 일기를 공유하면 휴대폰에서도 보여요.", 18f, color = ui.muted)
        ui.add(card, ui.button("차량 정보 저장", true) {
            if (allowed()) {
                val v = editors.map { it.text.toString().trim() }
                val snapshot = VehicleSnapshot(v[0], v[1], v[2], v[3], v[4], v[5], profileSource)
                if (prefs.edit().putString("profile", snapshot.json().toString()).putBoolean("mock-location", mock.isChecked).commit()) {
                    vehicleLookup.cancel(); vehicleLookupBusy = false; vehicleLookupButton.isEnabled = true
                    vehicleLookupNotice.text = "확인한 정보를 저장했어요. 필요한 항목은 직접 수정할 수 있어요."
                    message.text = "저장했어요. 다음 녹음의 시작 시점에 함께 남겨요."; hideKeyboard()
                } else message.text = "저장하지 못했어요. 다시 시도해 주세요."
            }
        }, 24); ui.add(card, message, 16)
        val info = ui.card(body)
        ui.add(info, ui.text("지금 연결된 기능", 24f, true))
        ui.add(info, ui.text("녹음·원본 재생·기기 내 음성 인식\n목업 일기 생성·이 기기에 저장\n\n차량 상태와 위치는 지원되는 에뮬레이터 신호로 확인해요. 실차 검증은 아직 진행 전이에요.", color = ui.muted), 16)
        ui.add(info, ui.button("모의 P 해제 · 사용 잠그기") { parked.isChecked = false }, 24)
        return scroll
    }
    private fun buildConnectionCard(body: LinearLayout) {
        val cloud = ui.card(body, 24)
        connectionTitle = ui.text("", 28f, true, ui.blue).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        ui.add(cloud, connectionTitle)
        connectionDescription = ui.text("", 20f, color = ui.muted); ui.add(cloud, connectionDescription, 16)
        val nameLabel = ui.text("차 별명", 20f, true); ui.add(cloud, nameLabel, 16)
        connectionLabel = ui.input("차 별명").apply { filters = arrayOf(android.text.InputFilter.LengthFilter(40)); setText(sync.deviceLabel.ifBlank { vehicle().nickname.ifBlank { vehicle().model.ifBlank { "우리 차" } } }) }
        nameLabel.labelFor = connectionLabel.id; ui.add(cloud, connectionLabel, 8)
        ui.add(cloud, ui.text("휴대폰의 연결 목록에 표시할 이름이에요. 예: 우리집 아이오닉", 18f, color = ui.muted), 8)
        renameButton = ui.button("차 별명 저장") {
            val name = connectionLabel.text.toString().trim()
            if (name.isBlank()) { connectionLabel.error = "차 별명을 입력해 주세요."; return@button }
            runSync("차 별명을 저장했어요.") { sync.rename(name) }
        }; ui.add(cloud, renameButton, 12)
        connectionForm = ui.column(); ui.add(cloud, connectionForm, 16)
        connectionCode = ui.input("6자리 연결 코드").apply { hint = "6자리 연결 코드를 입력해주세요"; inputType = android.text.InputType.TYPE_CLASS_NUMBER; filters = arrayOf(android.text.InputFilter.LengthFilter(6)) }
        ui.add(connectionForm, connectionCode, 12)
        connectButton = ui.button("이 차량 연결하기", true) {
            if(BuildConfig.LOCAL_MOCK && !sync.configured()) { importServerSettings(); return@button }
            val code = connectionCode.text.toString().trim()
            if (!Regex("[0-9]{6}").matches(code)) { syncNotice = "휴대폰의 6자리 코드를 모두 입력해 주세요."; syncFailed = true; renderConnection(); return@button }
            val name = connectionLabel.text.toString().trim()
            if (name.isBlank()) { connectionLabel.error = "차 별명을 입력해 주세요."; return@button }
            runSync("차량 연결 완료 · 완성한 일기를 자동으로 동기화해요.") { sync.pair(code, name); SyncUploads.request(this,sync); sync.pull() }
        }; ui.add(connectionForm, connectButton, 16)
        connectionCode.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { if (initialized) renderConnection() }
            override fun afterTextChanged(s: android.text.Editable?) = Unit
        })
        connectionFeedback = ui.text("", 20f).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
        ui.add(cloud, connectionFeedback, 16)
        chooseMemoryButton = ui.button("일기 보관함 보기", true) { navigate(Screen.LIBRARY) }; ui.add(cloud, chooseMemoryButton, 16)
        syncButton = ui.button("변경 사항 동기화") { runSync { SyncUploads.request(this,sync);sync.pull() } }; ui.add(cloud, syncButton, 12)
        ui.add(cloud, ui.text("연결하면 이 기기의 기존 완성 일기와 앞으로 완성하는 일기·원본 녹음·차량 및 녹음 위치가 가족 보관함에 자동 저장돼요. 다른 가족 보관함의 기록은 보내지 않아요. 연결 해제는 휴대폰에서 할 수 있어요.", 18f, color = ui.muted), 16)
    }
    private fun renderConnection() {
        if (!::connectionTitle.isInitialized) return
        val paired = sync.paired
        connectionTitle.text = when { syncBusy -> if (paired) "보관함과 동기화 중…" else "차량을 연결하고 있어요…"; paired -> "휴대폰 보관함과 연결됨"; else -> "휴대폰을 연결해 주세요" }
        connectionDescription.text = if (syncBusy) "서버의 연결 상태와 공유 기록을 확인하고 있어요." else if (paired) buildString {
            append("${sync.deviceLabel.ifBlank { "연결된 차량" }} · 원본까지 공유된 기록 ${sync.sharedCount}개")
            append(if (sync.lastVerifiedAt.isBlank()) "\n연결 정보 저장됨 · 마지막 확인 시각 미기록" else "\n마지막 서버 확인: ${displayDate(sync.lastVerifiedAt)}")
            append(if (sync.lastSyncedAt.isBlank()) "\n동기화를 누르면 최신 상태를 확인해요." else "\n마지막 동기화 완료: ${displayDate(sync.lastSyncedAt)}")
            if (sync.sharedCount == 0) append("\n완성한 일기를 자동으로 전송해요. 작성 중인 이야기는 기기에 보관해요.")
        } else "휴대폰의 ‘차량 연결’에서 코드를 만든 뒤 입력해 주세요."
        connectionForm.visibility = if (paired) View.GONE else View.VISIBLE
        if (::vehicleLookupButton.isInitialized) vehicleLookupButton.isEnabled = allowed() && idle() && !vehicleLookupBusy
        connectionLabel.isEnabled = allowed() && idle()
        renameButton.visibility = if (paired) View.VISIBLE else View.GONE
        renameButton.isEnabled = allowed() && idle()
        connectionCode.isEnabled = allowed() && idle()
        connectButton.isEnabled = allowed() && idle() && connectionCode.text.length == 6
        chooseMemoryButton.visibility = if (paired) View.VISIBLE else View.GONE
        syncButton.visibility = if (paired) View.VISIBLE else View.GONE
        chooseMemoryButton.isEnabled = allowed() && idle(); syncButton.isEnabled = allowed() && idle()
        connectionFeedback.text = if (syncBusy) "완료될 때까지 잠시 기다려 주세요." else syncNotice
        connectionFeedback.setTextColor(if (syncFailed && !syncBusy) ui.danger else ui.blue)
        connectionFeedback.visibility = if (syncBusy || syncNotice.isNotBlank()) View.VISIBLE else View.GONE
        libraryConnection.text = when { syncBusy -> "휴대폰 보관함과 동기화 중…"; paired -> "휴대폰 연결됨 · 원본까지 공유된 기록 ${sync.sharedCount}개"; else -> "휴대폰 미연결 · 기록은 이 기기에 보관돼요" }
        librarySync.text = if (paired) "휴대폰과 동기화" else "휴대폰 연결하기"
        librarySync.isEnabled = allowed() && idle()
    }
    private fun runSync(successMessage: String = "동기화 완료 · 완성 일기와 사진을 최신 상태로 맞췄어요.", complete: ((Throwable?) -> Unit)? = null, work: () -> Unit) {
        if (!allowed() || !idle() || !review.save()) { complete?.invoke(IllegalStateException("지금은 동기화할 수 없어요. 주차 및 저장 상태를 확인해 주세요.")); return }
        syncBusy = true; syncFailed = false; syncNotice = ""; sync.begin(); status.text = "휴대폰 보관함과 연결하고 있어요…"; hideKeyboard(); render()
        Thread({
            val result = runCatching { work() }
            runOnUiThread {
                syncBusy = false
                if (isDestroyed) return@runOnUiThread
                cacheVehicleName()
                syncFailed = result.isFailure
                syncNotice = result.fold({ successMessage }, { it.message ?: "연결하지 못했어요. 기록은 유지돼요. 다시 시도해 주세요." })
                status.text = syncNotice
                if (sync.paired) { connectionCode.setText(""); if (result.isSuccess && sync.deviceLabel.isNotBlank()) connectionLabel.setText(sync.deviceLabel) }
                val file = selected
                if (file != null && !file.exists()) { review.forgetDeleted(); selected = null; screen = Screen.LIBRARY }
                else if (result.isSuccess && file != null && allowed() && screen!=Screen.SETTINGS) openMemory(file)
                refreshLibrary(); render(); complete?.invoke(result.exceptionOrNull())
                if(complete==null && exact.visibility==View.VISIBLE) { if(result.isSuccess)exact.refresh() else exact.message(syncNotice) }
            }
        }, "family-vault-sync").start()
    }
    private fun loadVehicleDefaults() {
        if (vehicleLookupBusy) return
        vehicleLookupBusy = true; vehicleLookupNotice.text = "차량 정보를 확인하고 있어요…"; vehicleLookupButton.isEnabled = false
        vehicleLookup.read { result ->
            vehicleLookupBusy = false
            if (isDestroyed || !foreground || screen != Screen.SETTINGS || !allowed()) return@read
            applyingVehicleDefaults = true
            var filled = false
            mapOf(1 to "brand", 2 to "model", 4 to "year").forEach { (index, key) ->
                val editor = vehicleEditors[index]; val current = editor.text.toString()
                val value = VehicleDefaults.merge(current, index in vehicleEdited, result.values[key])
                if (value != current) { editor.setText(value); filled = true }
            }
            applyingVehicleDefaults = false
            if (filled) profileSource = if (result.emulator) "emulator_assisted" else "vehicle_assisted"
            vehicleLookupNotice.text = if (!filled && result.values.isNotEmpty()) "기존 입력은 유지했어요. 제조사·모델·연식은 직접 수정할 수 있어요." else result.notice
            vehicleLookupButton.isEnabled = allowed() && idle()
        }
    }
    private fun storedVehicle() = runCatching { VehicleSnapshot.read(JSONObject(prefs.getString("profile", "{}")!!)) }.getOrDefault(VehicleSnapshot())
    private fun vehicle():VehicleSnapshot {
        val profile=storedVehicle()
        val linked=if(::sync.isInitialized)sync.deviceLabel else ""
        val name=if(::sync.isInitialized && sync.nameUnified && linked.isNotBlank())linked
            else profile.nickname.ifBlank {linked.ifBlank {profile.model.ifBlank {"우리 차"}}}
        return profile.copy(nickname=name)
    }
    private fun cacheVehicleName(){
        if(!::sync.isInitialized || !sync.nameUnified || sync.deviceLabel.isBlank())return
        val profile=storedVehicle()
        if(profile.nickname!=sync.deviceLabel)prefs.edit().putString("profile",profile.copy(nickname=sync.deviceLabel).json().toString()).commit()
    }
    private fun navigate(next: Screen) {
        if (!allowed() || syncBusy || capture.busy || speech.busy || review.busy || !review.save()) return
        ++openGeneration; hideKeyboard(); screen = next; nativeEditor = false
        if (next != Screen.SETTINGS) { vehicleLookup.cancel(); vehicleLookupBusy = false }
        if (next == Screen.LIBRARY || next == Screen.RECORD) nativeEditor=false
        if (next == Screen.LIBRARY) refreshLibrary()
        if (next == Screen.RECORD) { timer.text = "00:00"; captureContext.text = contextDescription(MemoryContext(Instant.now().toString(), vehicle(), prefs.getBoolean("mock-location", false))).substringBefore("\n녹음 시작:") + "\n녹음을 시작하는 순간의 값으로 보관해요." }
        render()
        if(next == Screen.LIBRARY) exact.library()
        else if(next == Screen.RECORD) exact.restore("carhome",null)
        else if(next == Screen.SETTINGS) exact.settings()
    }
    private fun access():VehicleInteractionPolicy.Access {
        val motion=when {::parked.isInitialized && parked.isChecked->VehicleInteractionPolicy.Motion.PARKED;::driving.isInitialized && driving.isChecked->VehicleInteractionPolicy.Motion.DRIVING;else->VehicleInteractionPolicy.Motion.UNKNOWN}
        return VehicleInteractionPolicy.access(motion,foreground,::consent.isInitialized && consent.isChecked,benchAvailable,benchAvailable)
    }
    private fun allowed() = access().review
    private fun audioAllowed() = access().audio
    private fun idle() = !syncBusy && !capture.busy && playbackService?.busy!=true && !speech.busy && (!::review.isInitialized || !review.busy)
    private fun render() {
        if (!initialized) return
        val allowed = allowed()
        val showWelcome=!audioAllowed()
        nativeRail.visibility=if(showWelcome)View.GONE else View.VISIBLE
        status.visibility=if(showWelcome)View.GONE else View.VISIBLE
        welcome.update(recordingService!=null,consent.isChecked && signalMotion==VehicleInteractionPolicy.Motion.UNKNOWN)
        gate.visibility = if (allowed) View.GONE else View.VISIBLE
        library.visibility = if (allowed && screen == Screen.LIBRARY) View.VISIBLE else View.GONE
        recording.visibility = if (allowed && screen == Screen.RECORD) View.VISIBLE else View.GONE
        detail.visibility = if (allowed && screen == Screen.DETAIL) View.VISIBLE else View.GONE
        settings.visibility = if (allowed && screen == Screen.SETTINGS) View.VISIBLE else View.GONE
        navigation.forEachIndexed { index, b ->
            b.isEnabled = allowed && idle()
            b.isSelected = when(index) { 0 -> screen == Screen.LIBRARY || screen == Screen.DETAIL; 1 -> screen == Screen.RECORD; else -> screen == Screen.SETTINGS }
            ui.style(b, false); b.textSize=16f; b.setPadding(ui.dp(8),ui.dp(18),ui.dp(8),ui.dp(18)); b.background=ui.shape(if(b.isSelected) ui.tint else ui.bg,22)
            b.setCompoundDrawables(null, NavigationIcon(index, if(b.isSelected) ui.ink else ui.muted).apply { setBounds(0,0,ui.dp(26),ui.dp(26)) },null,null);b.compoundDrawablePadding=ui.dp(8)
        }
        record.isEnabled = allowed && idle(); finish.isEnabled = allowed && capture.busy
        record.visibility = if(capture.busy) View.GONE else View.VISIBLE
        finish.visibility = if(capture.busy) View.VISIBLE else View.GONE
        recordIntro.visibility = if(capture.busy) View.GONE else View.VISIBLE
        timer.visibility = if(capture.busy) View.VISIBLE else View.GONE
        recordBadge.text = if(capture.busy) "● 녹음 중 · 이 기기에 보관" else if(sync.paired) "휴대폰과 연결됨" else "주차 후 녹음 준비"
        recordBadge.setTextColor(if(capture.busy) ui.coral else ui.blue)
        recentMemory.visibility = if(capture.busy) View.GONE else View.VISIBLE

        play.isEnabled = allowed && !syncBusy && selected != null && !capture.busy && !speech.busy && !review.busy
        play.text = if (player != null && prepared) if (player!!.isPlaying) "일시정지" else "이어서 듣기" else "원본 재생"
        stop.isEnabled = playbackService?.busy==true
        seek.isEnabled = allowed && !syncBusy && selected != null && !capture.busy && !speech.busy && !review.busy
        recognize.isEnabled = allowed && idle() && selected != null
        readBody.visibility = if (tab == 0) View.VISIBLE else View.GONE
        originalBody.visibility = if (tab == 1) View.VISIBLE else View.GONE
        editBody.visibility = if (tab == 2) View.VISIBLE else View.GONE
        tabs.forEachIndexed { i, button -> ui.style(button, i == tab); button.isSelected = i == tab; button.isEnabled = allowed && !syncBusy && !capture.busy && !speech.busy && !review.busy }
        review.render(); renderConnection()
        if(::exact.isInitialized){
            val useExact=audioAllowed() && (!nativeEditor || driving.isChecked)
            exact.visibility=if(useExact) View.VISIBLE else View.GONE
            nativeShell.visibility=if(useExact) View.GONE else View.VISIBLE
            if(useExact){exact.start();exact.state(referenceState())}
            else if(audioAllowed() && driving.isChecked)exact.state(referenceState())
        }
        renderDriving()
        modeSwitch.visibility=if(benchAvailable && foreground && consent.isChecked)View.VISIBLE else View.GONE
        modeSwitch.isEnabled=recordingService!=null
        modeSwitch.bringToFront();modeSwitch.elevation=ui.dp(16).toFloat()
        modeSwitch.text=if(parked.isChecked)"시험: 주행으로 전환" else "시험: 주차로 전환"
        // The emulator-only switch gets its own strip, outside the adaptive app content.
        val top=if(modeSwitch.visibility==View.VISIBLE)ui.dp(56) else 0
        for(surface in listOf(exact,nativeShell)) {
            val layout=surface.layoutParams as FrameLayout.LayoutParams
            if(layout.topMargin!=top){layout.topMargin=top;surface.layoutParams=layout}
        }
    }
    private fun focus(): Boolean {
        hasFocus = audio.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (!hasFocus) status.text = "오디오를 사용할 수 없어요. 잠시 뒤 다시 시작해 주세요."
        return hasFocus
    }
    private fun abandonFocus() { if (hasFocus) audio.abandonAudioFocusRequest(focusRequest); hasFocus = false }
    private fun startCapture() {
        if (!audioAllowed() || !idle() || !review.save()) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(if(Build.VERSION.SDK_INT>=33)arrayOf(Manifest.permission.RECORD_AUDIO,Manifest.permission.POST_NOTIFICATIONS) else arrayOf(Manifest.permission.RECORD_AUDIO), 10); return
        }
        val service=recordingService ?: run {status.text="녹음 서비스를 준비하고 있어요. 잠시 후 다시 눌러 주세요.";return}
        listeningSession=false
        val start=Instant.now()
        val synthetic=prefs.getBoolean("mock-location",false)
        val snapshot=MemoryContext(start.toString(),vehicle(),synthetic,if(synthetic)RecordedLocation("synthetic",start.toString()) else recordingLocation.snapshot(start.toEpochMilli()))
        captureContext.text=contextDescription(snapshot)
        try {
            service.configure(capture,store,contexts)
            service.setConsent(consent.isChecked)
            service.begin(snapshot)
            handledRecording=null
            status.text="녹음 중 · 자유롭게 이야기해 주세요"
        }catch(e:Exception){status.text=e.message?:"녹음을 시작하지 못했어요.";exact.message(status.text.toString())}
        render()
    }
    private fun applyLiveTranscript() {
        val file=liveFile ?: return
        if(speech.busy || liveApplied || liveText.isBlank())return
        try {
            if(allowed() && review.fileId==file.name)review.speechResult(file,liveText,speech.segments)
            else {
                val updated=store.load(file).withSpeech(liveText,speech.segments);store.save(updated)
                if(review.fileId==file.name){review.select(null);review.select(file,updated)}
            }
            liveApplied=true
        } catch(_:Exception) { liveStatus="인식문 저장을 확인해 주세요. 원본은 보관돼요." }
    }
    private fun retryReferenceSpeech(file:File) {
        selectReference(file);stopPlayback();check(idle())
        liveFile=file;liveText="";liveApplied=false;liveStatus="원본을 다시 글로 옮기는 중"
        speech.run(file,onStatus={value->liveStatus=value.substringBefore('\n');exact.state(referenceState())},
            onDone={applyLiveTranscript();exact.state(referenceState());render()},
            onResult={value->liveText=value})
        render()
    }
    private fun requestRecordingLocation() {
        if(driving.isChecked || capture.busy || playbackService?.busy==true)return
        if(checkSelfPermission("pleos.car.permission.FUSED_LOCATION")==PackageManager.PERMISSION_GRANTED){
            recordingLocation.close();recordingLocation.start()
            modal=AlertDialog.Builder(this).setTitle("녹음 위치 권한이 허용되어 있어요")
                .setMessage("녹음 시작 직전의 위치만 보관해요. 일기를 공유하면 위치도 가족 보관함에서 볼 수 있어요. 권한은 시스템 앱 설정에서 해제할 수 있어요.").setPositiveButton("확인",null).show().also{styleDialog(it)}
        }else modal=AlertDialog.Builder(this).setTitle("녹음 시작 위치를 남길까요?")
            .setMessage("녹음 시작 직전 위치를 일기에 함께 보관하고 공유 시 가족 보관함으로 보내요. 허용하지 않아도 녹음할 수 있어요.")
            .setNegativeButton("나중에",null).setPositiveButton("권한 설정"){_,_->requestPermissions(arrayOf("pleos.car.permission.FUSED_LOCATION"),11)}.show().also{styleDialog(it)}
    }
    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if(code==11){recordingLocation.close();if(foreground)recordingLocation.start();status.text=if(results.firstOrNull()==PackageManager.PERMISSION_GRANTED)"다음 녹음부터 조회 가능한 위치를 함께 남겨요." else "위치 권한 없이도 녹음할 수 있어요.";render()}
        if (code == 10) { status.text = if (results.firstOrNull() == PackageManager.PERMISSION_GRANTED) "마이크 권한을 받았어요. 차량 상태를 확인하고 녹음을 시작해 주세요." else "마이크 권한이 없어 녹음할 수 없어요."; render() }
    }
    private fun playOriginal() {
        drivingNotice=""
        val file=selected?:return
        if(!audioAllowed() || syncBusy || capture.busy || speech.busy || review.busy)return
        val service=playbackService?:return
        service.setSimulation(recordingService?.simulation)
        if(service.file==file && service.player!=null)service.toggle()
        else {
            activeListenMode="original"
            val rows=drivingDiaryFiles();val index=rows.indexOf(file)
            if(index>=0)service.playQueue(rows,index,pendingSeek) else service.play(file,pendingSeek)
        }
        render()
    }
    private fun runSpeech(file: File) {
        if (!allowed() || !idle() || !review.save() || !focus()) return
        speech.run(file, onStatus = { sttStatus.text = it }, onDone = { abandonFocus(); render() },
            onResult = { value -> review.speechResult(file, value,speech.segments) })
        render()
    }
    private fun stopPlayback() {
        drivingSwitchGeneration++;listeningSession=false
        playbackService?.stop()
        listeningSession=false
        handler.removeCallbacks(ticker);prepared=false;completedPlayback=0.0;player=null;pendingSeek=0
        if(::seek.isInitialized){seek.progress=0;position.text="00:00 / ${time(review.record?.durationMs?:0)}"}
        abandonFocus()
    }
    private fun interrupt(message: String) {
        if (!initialized) return
        drivingNotice=message
        ++openGeneration
        sync.cancel()
        modal?.dismiss(); modal = null
        review.save(); review.cancel(); recordingService?.interrupt(message);capture.stop(true); stopPlayback(); speech.cancel(); abandonFocus()
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
                addPhotoGrid(photosBody, photos.take(4))
                if (photos.size > 4) ui.add(photosBody, ui.button("사진 더보기 · 전체 ${photos.size}장") {
                    if (allowed() && idle()) showAllPhotos(photos)
                }, 16)
            }
        }, "memory-photo-thumbnails").start()
    }
    private fun addPhotoGrid(parent: LinearLayout, photos: List<Pair<File, android.graphics.Bitmap?>>) {
        photos.chunked(2).forEachIndexed { rowIndex, pair ->
            val row = ui.row(); ui.add(parent, row, 12)
            pair.forEachIndexed { index, (file, bitmap) ->
                val image = ImageView(this).apply {
                    setImageBitmap(bitmap); scaleType = ImageView.ScaleType.FIT_CENTER
                    contentDescription = "사진 ${rowIndex * 2 + index + 1} 크게 보기"; tag = "photo:${file.name}"
                    isFocusable = true; setBackgroundResource(android.R.drawable.list_selector_background)
                    setOnClickListener { if (allowed() && idle()) { modal?.dismiss(); showPhoto(file) } }
                    accessibilityDelegate = object : View.AccessibilityDelegate() {
                        override fun onInitializeAccessibilityNodeInfo(host: View, info: android.view.accessibility.AccessibilityNodeInfo) {
                            super.onInitializeAccessibilityNodeInfo(host, info); info.className = "android.widget.Button"
                        }
                    }
                }
                row.addView(image, LinearLayout.LayoutParams(0, ui.dp(128), 1f).apply { if (index == 0) marginEnd = ui.dp(12) })
            }
            if (pair.size == 1) row.addView(View(this), LinearLayout.LayoutParams(0, ui.dp(128), 1f))
        }
    }
    private fun showAllPhotos(photos: List<Pair<File, android.graphics.Bitmap?>>) {
        val body = ui.column().apply { setPadding(ui.dp(16), 0, ui.dp(16), ui.dp(16)) }
        addPhotoGrid(body, photos)
        val scroll = ScrollView(this).apply { addView(body) }
        val dialog = AlertDialog.Builder(this).setTitle("함께 남긴 사진 · ${photos.size}장")
            .setView(scroll).setPositiveButton("닫기", null).create()
        modal = dialog; dialog.show(); styleDialog(dialog)
        scroll.layoutParams = scroll.layoutParams.apply { height = (resources.displayMetrics.heightPixels * 0.55).toInt() }
        dialog.window?.setLayout((resources.displayMetrics.widthPixels * 0.85).toInt(), -2)
    }
    private fun showPhoto(file: File) {
        val image = ImageView(this).apply {
            setImageBitmap(BitmapFactory.decodeFile(file.path)); adjustViewBounds = true
            scaleType = ImageView.ScaleType.FIT_CENTER; maxHeight = (resources.displayMetrics.heightPixels * 0.55).toInt()
            contentDescription = "첨부 사진 확대"
        }
        val dialog = AlertDialog.Builder(this).setView(image).setPositiveButton("닫기", null)
            .setNegativeButton("사진 삭제") { _, _ -> if (allowed() && idle()) confirmDeletePhoto(file) }.create()
        modal = dialog; dialog.show(); styleDialog(dialog)
        dialog.window?.setLayout((resources.displayMetrics.widthPixels * 0.85).toInt(), -2)
    }
    private fun confirmDeletePhoto(file: File) {
        val original = selected ?: return
        modal = AlertDialog.Builder(this).setTitle("이 사진을 삭제할까요?")
            .setMessage("공유 사진은 가족 보관함에서도 삭제해요. 연결되지 않은 기기에는 다음 동기화 때 반영돼요.")
            .setNegativeButton("취소") { _, _ -> if (allowed() && idle() && selected == original) showPhoto(file) }
            .setPositiveButton("삭제") { _, _ ->
                if (allowed() && idle() && selected == original) {
                    if (sync.linked(original.name)) runSync { sync.deletePhoto(original, file) }
                    else {
                        photoStatus.text = if (contexts.deletePhoto(original.name, file)) "사진을 삭제했어요." else "삭제하지 못했어요. 다시 시도해 주세요."
                        loadPhotos(original.name)
                    }
                }
            }.show().also { styleDialog(it) }
    }
    private fun styleDialog(dialog: AlertDialog) {
        dialog.window?.setBackgroundDrawable(ui.shape(ui.surface,24))
        val titleId=resources.getIdentifier("alertTitle","id","android")
        if(titleId!=0) dialog.findViewById<TextView>(titleId)?.setTextColor(ui.ink)
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
                    runSync("이 기기에서 삭제했어요. 가족 보관함에도 반영해요.") { sync.delete(file);SyncUploads.request(this,sync) }
                }
            }.show().also { styleDialog(it) }
    }
    private fun settingsState()=VehicleTheme.state(this)
        .put("server_setup_available",BuildConfig.LOCAL_MOCK).put("server_configured",sync.configured())
        .put("paired",sync.paired).put("device_label",sync.deviceLabel).put("last_synced_at",sync.lastSyncedAt)
        .put("syncing",syncBusy || sync.uploading).put("sync_notice",sync.uploadNotice.ifBlank {syncNotice})
        .put("vehicle",vehicle().json()).put("version",BuildConfig.VERSION_NAME)
        .put("name_pending",sync.namePending).put("name_notice",if(vehicle().nickname.length>40)"차 별명을 40자 이내로 수정해 주세요. 기존 이름은 보존돼 있어요." else if(sync.namePending)"차 별명 반영 대기 · 연결되면 휴대폰에도 같은 이름으로 표시돼요." else "")
        .put("location_granted",checkSelfPermission("pleos.car.permission.FUSED_LOCATION")==PackageManager.PERMISSION_GRANTED)
    private fun drivingDiaryFiles() = drivingDiaryRows ?: drivingOriginals().filter { narrationItem(it)!=null }
        .sortedWith(compareByDescending<File>{store.load(it).recordedAt}.thenBy{it.name}).also { drivingDiaryRows=it;listenCatalogVersion++ }
    private fun listenPage(request:JSONObject):JSONObject {
        check(audioAllowed() && !capture.busy)
        val rows=drivingDiaryFiles();val direction=request.optString("direction","around")
        require(direction in setOf("around","before","after"))
        val cursor=request.optString("cursor");val cursorIndex=rows.indexOfFirst{it.name==cursor}
        val reset=direction!="around" && (cursorIndex<0 || request.optInt("version",-1)!=listenCatalogVersion)
        val anchor=if(direction=="around"||reset)rows.indexOf(drivingListenFile()).coerceAtLeast(0) else cursorIndex
        val indices=io.hmg.familydiary.capture.ListenWindow.indices(rows.size,anchor,if(reset)"around" else direction)
        val items=org.json.JSONArray();indices.forEach{items.put(JSONObject(drivingSummary(rows[it]).toString()).put("id",rows[it].name))}
        return JSONObject().put("items",items).put("version",listenCatalogVersion).put("reset",reset).put("total",rows.size)
            .put("before",if(indices.isEmpty())false else indices.first>0).put("after",if(indices.isEmpty())false else indices.last<rows.lastIndex)
    }
    private fun drivingListenFile():File? = drivingDiaryFiles().let { rows ->
        playbackService?.file?.takeIf { playbackService?.busy==true && it in rows }
            ?: selected?.takeIf { it in rows } ?: rows.firstOrNull()
    }
    private fun switchListening(target:File,mode:String,resume:Boolean) {
        stopPlayback()
        val generation=drivingSwitchGeneration
        activeListenMode=mode;listeningSession=true
        fun apply(attempt:Int) {
            if(generation!=drivingSwitchGeneration || !audioAllowed() || capture.busy || speech.busy || syncBusy || review.busy)return
            val service=playbackService?:return
            if(service.busy){if(attempt<200)handler.postDelayed({apply(attempt+1)},50);return}
            runCatching {
                selectReference(target);activeListenMode=mode;listeningSession=true
                if(resume){if(mode=="diary")startDrivingNarration() else playOriginal()}
                render()
            }.onFailure{drivingNotice=it.message.orEmpty();render()}
        }
        handler.post{apply(0)}
    }
    private fun drivingListen(action:String,memoryId:String="") {
        check(audioAllowed() && !capture.busy && !speech.busy && !syncBusy && !review.busy)
        if(action=="listenExit"){stopPlayback();render();return}
        val service=checkNotNull(playbackService)
        check(!service.settling){"음성 전환을 기다려 주세요."}
        if(action=="listenAutoplay"){service.toggleAutoAdvance();render();return}
        if(action=="listenToggle" && service.busy){service.toggle();render();return}
        val rows=drivingDiaryFiles();val current=drivingListenFile()?:error("완성된 일기가 없어요.")
        val wasPlaying=service.speaking || service.player?.isPlaying==true
        when(action) {
            "listenDiary", "listenOriginal" -> {
                val mode=if(action=="listenDiary")"diary" else "original"
                drivingListenMode=mode
            }
            "listenSwitchDiary", "listenSwitchOriginal" -> {
                val mode=if(action=="listenSwitchDiary")"diary" else "original"
                drivingListenMode=mode
                switchListening(current,mode,false)
            }
            "listenToggle" -> {
                listeningSession=true
                if(service.busy)service.toggle()
                else {selectReference(current);listeningSession=true;if(activeListenMode=="diary")startDrivingNarration() else playOriginal()}
            }
            "listenPrevious", "listenNext" -> {
                val index=rows.indexOf(current)+(if(action=="listenPrevious")-1 else 1)
                rows.getOrNull(index)?.let{switchListening(it,activeListenMode,wasPlaying)}
            }
            "listenSelect" -> {
                val target=rows.firstOrNull{it.name==memoryId}?:error("일기가 변경됐어요. 목록을 다시 확인해 주세요.")
                switchListening(target,drivingListenMode,true)
            }
            else -> error("지원하지 않는 음성 제어예요.")
        }
        render()
    }
    /** Only bounded audio metadata crosses the driving bridge; never body/photos/transcript. */
    private fun drivingSummary(file:File):JSONObject = drivingDiarySummaries.getOrPut(file) {
        val record=store.load(file)
        val at=runCatching {Instant.parse(record.recordedAt).atZone(zone)}.getOrNull()
        fun format(pattern:String)=at?.format(DateTimeFormatter.ofPattern(pattern,java.util.Locale.KOREA)).orEmpty()
        JSONObject().put("title",narrationItem(file)?.title?.take(80)?:"그날의 일기")
            .put("date",format("M월 d일 EEEE")).put("day",format("dd"))
            .put("short_date",format("M월 · EEEE")).put("duration_ms",record.durationMs)
    }
    private fun drivingListenState():JSONObject {
        if(!audioAllowed())return JSONObject().put("available",false)
        val rows=drivingDiaryFiles();val file=drivingListenFile();val index=rows.indexOf(file)
        val enabled=!capture.busy && !speech.busy && !syncBusy && !review.busy && playbackService?.settling!=true
        val service=playbackService;val summary=file?.let(::drivingSummary)
        return JSONObject().put("mode",activeListenMode).put("browse_mode",drivingListenMode).put("auto_advance",service?.autoAdvance==true).put("available",enabled && file!=null)
            .put("memory",file?.name?:JSONObject.NULL).put("date",summary?.optString("date")?:"")
            .put("title",summary?.optString("title")?:"").put("count",rows.size).put("index",index)
            .put("duration_ms",summary?.optLong("duration_ms")?:0L).put("elapsed",service?.narrationElapsed?:0.0)
            .put("catalog_version",listenCatalogVersion).put("playing",service?.speaking==true || service?.player?.isPlaying==true).put("paused",service?.narrationPaused==true || service?.prepared==true && service.player?.isPlaying==false).put("settling",service?.settling==true).put("preparing",service?.busy==true && service.player==null && !service.speaking && !service.narrationPaused)
            .put("previous",enabled && index>0)
            .put("next",enabled && index>=0 && index<rows.lastIndex)
    }
    private var playbackSummaryFile:File?=null
    private var playbackSummaryTitle=""
    private fun parkedPlaybackState():JSONObject {
        val service=playbackService
        if(!allowed() || (service?.busy!=true && !listeningSession)){playbackSummaryFile=null;return JSONObject().put("active",false)}
        val file=if(service?.busy==true)service.file else drivingListenFile()
        if(file==null)return JSONObject().put("active",false)
        if(playbackSummaryFile!=file){playbackSummaryFile=file;playbackSummaryTitle=file.let{narrationItem(it)?.title?.take(80) ?: "확인할 이야기 · ${displayDate(store.load(it).recordedAt)}"}}
        val original=activeListenMode=="original"
        return JSONObject().put("active",true).put("mode",if(original)"original" else "diary")
            .put("paused",service?.narrationPaused==true || service?.prepared==true && service.player?.isPlaying==false)
            .put("title",service?.narrationTitle.orEmpty().ifBlank{playbackSummaryTitle}).put("memory",file?.name)
            .put("settling",service?.settling==true).put("preparing",service?.busy==true && service.player==null && !service.speaking && !service.narrationPaused).put("playing",if(original)service?.prepared==true && runCatching{service.player?.isPlaying==true}.getOrDefault(false) else service?.speaking==true)
            .put("position",if(original && service?.prepared==true)runCatching{service.player!!.currentPosition/1000.0}.getOrDefault(0.0) else service?.narrationElapsed?:0.0)
            .put("duration",if(original && service?.prepared==true)runCatching{service.player!!.duration/1000.0}.getOrDefault(0.0) else 0.0)
    }
    private fun referenceState() = VehicleTheme.state(this).put("playback",parkedPlaybackState()).put("driving_transcript",if(audioAllowed() && driving.isChecked && capture.busy)liveText.takeLast(180) else "").put("driving_listen",drivingListenState()).put("driving",::driving.isInitialized && driving.isChecked).put("sync_notice",sync.uploadNotice.ifBlank { syncNotice }).put("paired",sync.paired).put("recording",capture.busy).put("paused",capture.paused)
        .put("stt_busy",speech.busy).put("stt_text",if(allowed() && (capture.busy || liveFile==selected))liveText else "").put("stt_status",if(capture.busy || liveFile==selected)liveStatus else "").put("stt_memory",liveFile?.name?:JSONObject.NULL)
        .put("level",if(capture.busy && !capture.paused)captureLevel else 0f).put("sync_pending",syncPending && sync.paired).put("narrating",playbackService?.busy==true && player==null).put("playback_notice",playbackService?.notice.orEmpty()).put("syncing",syncBusy || sync.uploading).put("elapsed",captureElapsed/1000.0).put("memoryId",selected?.name?:JSONObject.NULL)
        .put("position",if(prepared) runCatching { player?.currentPosition?.div(1000.0)?:0.0 }.getOrDefault(0.0) else completedPlayback)
         .put("audio_memory",if(prepared)selected?.name?:JSONObject.NULL else JSONObject.NULL).put("tts_active",playbackService?.narrating==true).put("tts_index",playbackService?.queueIndex?:-1).put("tts_count",playbackService?.queueCount?:0)
        .put("tts_title",if(allowed())playbackService?.narrationTitle.orEmpty() else "").put("tts_previous",playbackService?.hasPrevious==true).put("tts_next",playbackService?.hasNext==true)
        .put("playing",prepared && runCatching { player?.isPlaying==true }.getOrDefault(false))
        .put("can_record",idle()).put("can_play",selected!=null && !capture.busy && !speech.busy && !syncBusy && !review.busy)
        .put("can_narrate",idle() && (drivingHasDiary ?: drivingOriginals().any { narrationItem(it)!=null }.also {drivingHasDiary=it}))
        .put("original_previous",drivingOriginals().indexOf(selected).let {it>=0 && it<drivingOriginals().lastIndex}).put("original_next",drivingOriginals().indexOf(selected)>0)
        .put("audio_selected",selected!=null).put("audio_date",selected?.let {displayDate(review.record?.recordedAt)}?:"").put("audio_busy",playbackService?.busy==true)
        .put("settings",if(allowed() && screen==Screen.SETTINGS)settingsState() else JSONObject.NULL)
    private fun referenceFile(id:String):File {
        require(id.isNotBlank() && !id.contains('/') && !id.contains('\\') && id.endsWith(".wav"))
        return File(directory,id).also { require(it.isFile && it.canonicalFile.parentFile==directory.canonicalFile) }
    }
    private fun referenceRecord(file:File):JSONObject {
        val r=store.load(file)
        val photos=org.json.JSONArray()
        contexts.photos(file.name).forEach { f -> photos.put(JSONObject().put("id",f.name).put("url","https://chagok.local/_photos/${android.net.Uri.encode(file.name)}/${android.net.Uri.encode(f.name)}")) }
        val wave=if(file==selected)waveformCache.getOrPut(file.name) { org.json.JSONArray(io.hmg.familydiary.capture.WaveEnvelope.read(file)) } else org.json.JSONArray()
        return JSONObject().put("waveform",wave).put("id",file.name).put("revision",r.revision).put("audio_ready",true).put("saved",r.accepted==r.revision && r.draftRevision==r.revision && r.draft!=null).put("draft_current",r.draftRevision==r.revision && r.draft!=null).put("sync_status",sync.shareStatus(file.name,r.revision)).put("shared",sync.shareStatus(file.name,r.revision)=="shared").put("linked",sync.linked(file.name)).put("photos",photos)
            .put("snapshot",JSONObject().put("recorded_at",r.recordedAt).put("speaker",r.speaker.ifBlank { "화자 확인 전" }).put("duration_ms",r.durationMs)
                .put("context",contexts.load(file.name)?.json()?:JSONObject.NULL).put("text",r.text).put("draft",r.draft?:"{\"groups\":[]}").put("generation_mode",r.generationMode).put("raw_history",org.json.JSONArray(r.rawHistory)).apply{r.speechTimeline?.let{put("speech_timeline",JSONObject(it))}})
    }
    private fun selectReference(file:File){
        if(selected==file)return
        check(!capture.busy && !speech.busy && !review.busy && !syncBusy)
        stopPlayback();check(review.save());check(review.select(file,store.load(file)));selected=file;pendingSeek=0;if(allowed())populateDetail()
    }
    private fun referenceCommand(request:JSONObject,reply:(JSONObject)->Unit){
        try{
            check(VehicleInteractionPolicy.permits(request.getString("cmd"),access())){ "이 기능은 주차와 공동 녹음 안내를 확인한 뒤 사용할 수 있어요." }
            val id=request.optString("memoryId")
            val result=when(request.getString("cmd")){
                "view"->{referencePage=request.optString("page");if(!capture.busy && referencePage in setOf("carhome","carlist","cardetail"))pendingCaptureReview=null;screen=when(referencePage){"carsettings"->Screen.SETTINGS;"carhome","recording"->Screen.RECORD;"carlist"->Screen.LIBRARY;else->Screen.DETAIL};JSONObject()}
                "state"->referenceState()
                "driveAction"->{
                    check(driving.isChecked);renderDriving()
                    val action=request.getString("action")
                    if(action in setOf("listenDiary","listenOriginal","listenToggle","listenPrevious","listenNext","listenExit","listenAutoplay")) {
                        drivingListen(action)
                    } else {
                    val control=when(action){
                        "record"->drivingRecord;"pause"->drivingPause;"finish"->drivingFinish
                        "play"->drivingPlay;"stop"->drivingStop;"previous"->drivingPrevious;"next"->drivingNext
                        "narrate"->drivingTtsStart;"ttsPrevious"->drivingTtsPrevious;"ttsNext"->drivingTtsNext;"ttsStop"->drivingTtsStop
                        else->error("지원하지 않는 음성 제어예요.")
                    }
                    check(control.isEnabled){"지금은 이 음성 기능을 사용할 수 없어요."};control.performClick()
                    };referenceState()
                }
                "listenPage"->listenPage(request)
                "listenAction"->{drivingListen(request.getString("action"),id);referenceState()}
                "list"->{ val rows=org.json.JSONArray();directory.listFiles()?.filter { it.name.endsWith(".wav") }?.forEach { runCatching { referenceRecord(it) }.getOrNull()?.let(rows::put) };JSONObject().put("items",rows) }
                "read"->{val file=referenceFile(id);if(playbackService?.busy!=true)selectReference(file);referenceRecord(file)}
                "start"->{ nativeEditor=false;screen=Screen.RECORD;startCapture();check(capture.busy){status.text.toString()};referenceState() }
                "pauseCapture"->{recordingService?.pauseOrResume();exact.state(referenceState());referenceState()}
                "finish"->{recordingService?.finish();JSONObject()}
                "play"->{val file=referenceFile(id);if(playbackService?.narrating==true)switchListening(file,"original",true) else {selectReference(file);playOriginal()};referenceState()}
                "playSegment"->{
                    val file=referenceFile(id);val r=store.load(file)
                    val rows=JSONObject(checkNotNull(r.speechTimeline)).getJSONArray("segments")
                    val row=(0 until rows.length()).map{rows.getJSONObject(it)}.first {it.getString("id")==request.getString("segmentId")}
                    check(!row.isNull("start_ms") && !row.isNull("end_ms"));check(audioAllowed() && !capture.busy && !speech.busy && !syncBusy && !review.busy)
                    selectReference(file);stopPlayback();pendingSeek=row.getLong("start_ms").toInt();playOriginal();referenceState()
                }
                "seek"->{ if(id.isNotBlank())selectReference(referenceFile(id));val pos=(request.optDouble("position",0.0).coerceAtLeast(0.0)*1000).toInt();pendingSeek=pos.coerceAtMost((review.record?.durationMs?:0L).toInt());if(prepared)player?.seekTo(pendingSeek);referenceState() }
                "togglePlayback"->{check(audioAllowed());playbackService?.toggle();referenceState()}
                "stopPlayback"->{stopPlayback();JSONObject()}
                "edit"->{selectReference(referenceFile(id));stopPlayback();nativeEditor=false;screen=Screen.DETAIL;render();exact.review(id);JSONObject()}
                "retrySpeech"->{retryReferenceSpeech(referenceFile(id));JSONObject()}
                "createDiary"->{
                    selectReference(referenceFile(id));stopPlayback()
                    review.createFromWeb(request.getString("text"),request.getString("speaker")) { error ->
                        reply(if(error==null)referenceRecord(referenceFile(id)) else JSONObject().put("error",error))
                    }
                    return
                }
                "saveDiary"->{selectReference(referenceFile(id));check(review.record?.revision==request.getInt("revision") && review.record?.text==request.getString("text") && review.record?.speaker==request.getString("speaker")) { "이야기가 변경됐어요. 다시 만들어 주세요." };check(review.acceptFromWeb()) { "저장할 초안을 확인해 주세요." };pendingCaptureReview=null;drivingRows=null;drivingHasDiary=null;drivingDiaryRows=null;drivingDiarySummaries.clear();sync.capture(referenceFile(id));SyncUploads.request(this,sync);referenceRecord(referenceFile(id))}
                "renameDiary"->{
                    check(idle() && !sync.uploading){"재생이나 동기화를 마친 뒤 제목을 저장해 주세요."}
                    val file=referenceFile(id);check(review.save());val old=store.load(file)
                    check(old.revision==request.getInt("revision")){"일기가 변경됐어요. 다시 열어 주세요."}
                    val next=old.renameTitle(request.getString("title"));store.save(next)
                    if(selected==file){review.select(null);check(review.select(file,next))}
                    drivingDiaryRows=null;drivingDiarySummaries.clear();playbackSummaryFile=null
                    sync.capture(file);SyncUploads.request(this,sync);referenceRecord(file)
                }
                "setTheme"->{VehicleTheme.select(this,request.getString("mode"));applyAppearance();VehicleTheme.state(this)}
                "settings"->{check(!syncBusy && !capture.busy && !speech.busy && !review.busy){ "진행 중인 작업을 마친 뒤 설정을 열어 주세요." };navigate(Screen.SETTINGS);JSONObject()}
                "getSettings"->{
                    val name=vehicle().nickname
                    if(sync.paired && !sync.nameUnified && name.length in 1..40 && idle()) {
                        runSync("차 별명을 하나로 맞췄어요.",complete={error->reply(if(error==null)settingsState() else JSONObject().put("error",error.message?:"차 별명을 확인해 주세요."))}) {
                            sync.adoptVehicleName(name);SyncUploads.request(this,sync)
                        };return
                    }
                    settingsState()
                }
                "importServerSettings"->{check(BuildConfig.LOCAL_MOCK);importServerSettings();JSONObject()}
                "locationSettings"->{check(idle()){ "진행 중인 작업을 마친 뒤 다시 눌러 주세요." };requestRecordingLocation();settingsState()}
                "lookupVehicle"->{
                    check(idle()){ "진행 중인 작업을 마친 뒤 다시 눌러 주세요." };vehicleLookup.read { result ->
                        reply(if(allowed() && screen==Screen.SETTINGS) JSONObject().put("values",JSONObject(result.values)).put("notice",result.notice).put("source",if(result.emulator)"emulator_assisted" else "vehicle_assisted")
                            else JSONObject().put("error","주차 상태에서 다시 확인해 주세요."))
                    };return
                }
                "saveVehicle"->{
                    check(idle()){ "진행 중인 작업을 마친 뒤 다시 눌러 주세요." };val input=request.getJSONObject("vehicle")
                    val values=listOf("nickname","brand","model","type","year","plate").map {key->input.getString(key).trim().also {require(it.length<=60){"차량 정보는 항목마다 60자 이내로 입력해 주세요."}}}
                    require(values[0].length in 1..40){"차 별명을 1~40자로 입력해 주세요."}
                    val source=input.optString("source","manual").takeIf {it in setOf("manual","emulator_assisted","vehicle_assisted")}?:"manual"
                    val profile=VehicleSnapshot(values[0],values[1],values[2],values[3],values[4],values[5],source)
                    if(sync.paired) {
                        runSync("차량 정보를 저장했어요.",complete={error->reply(if(error==null)settingsState() else JSONObject().put("error",error.message?:"차량 정보를 저장하지 못했어요."))}) {
                            check(prefs.edit().putString("profile",profile.json().toString()).commit()) {"차량 정보를 저장하지 못했어요."}
                            sync.queueVehicleName(profile.nickname);SyncUploads.request(this,sync)
                        };return
                    }
                    check(prefs.edit().putString("profile",profile.json().toString()).commit()) {"차량 정보를 저장하지 못했어요."}
                    settingsState()
                }
                "pairVehicle","syncSettings"->{
                    check(idle()) {"진행 중인 작업을 마친 뒤 다시 눌러 주세요."}
                    val operation=request.getString("cmd")
                    val label=vehicle().nickname.trim()
                    val code=request.optString("code").trim()
                    if(operation!="syncSettings")require(label.length in 1..40){"차 별명을 1~40자로 입력해 주세요."}
                    if(operation=="pairVehicle"){check(!sync.paired){"이미 연결된 차량이에요. 휴대폰에서 연결을 관리해 주세요."};require(Regex("[0-9]{6}").matches(code)){"휴대폰의 6자리 연결 코드를 입력해 주세요."}}
                    else check(sync.paired){"휴대폰을 먼저 연결해 주세요."}
                    runSync("변경 사항을 반영했어요.",complete={error->reply(if(error==null)settingsState() else JSONObject().put("error",error.message?:"연결을 확인해 주세요."))}) {
                        when(operation){"pairVehicle"->{sync.pair(code,label);SyncUploads.request(this,sync);sync.pull()};else->{sync.retryNow();SyncUploads.request(this,sync);sync.pull()}}
                    };return
                }
                "share"->{SyncUploads.request(this,sync);JSONObject()}
                "retrySync"->{sync.retryNow();SyncUploads.request(this,sync);JSONObject()}
                "removePhoto"->{selectReference(referenceFile(id));check(idle());val photo=contexts.photos(id).first { it.name==request.getString("photoId") };if(sync.linked(id)) { runSync { sync.deletePhoto(referenceFile(id),photo);runOnUiThread { exact.memory(id) } } }else contexts.deletePhoto(id,photo);JSONObject()}
                "delete"->{
                    val file=referenceFile(id);selectReference(file);stopPlayback();check(idle());check(review.save())
                    runSync("이 기기에서 삭제했어요. 연결되면 가족 보관함에서도 삭제해요.", complete={error ->
                        reply(if(error==null) JSONObject().put("deleted",true) else JSONObject().put("error",error.message?:"삭제하지 못했어요."))
                    }) { sync.delete(file);SyncUploads.request(this,sync) }
                    return
                }
                "tts"->{
                    val file=referenceFile(id);checkNotNull(narrationItem(file)){"먼저 일기를 완성해 주세요."};val service=checkNotNull(playbackService)
                    if(service.file==file && service.narrating){check(!service.settling);service.toggle()}
                    else switchListening(file,"diary",true)
                    referenceState()
                }
                "ttsQueue"->{
                    val ids=request.getJSONArray("memoryIds");require(ids.length() in 1..500)
                    val files=(0 until ids.length()).map {referenceFile(ids.getString(it))};require(files.distinct().size==files.size)
                    startNarration(files.map {checkNotNull(narrationItem(it)){"완성된 일기만 이어 들을 수 있어요."}});referenceState()
                }
                "ttsPrevious"->{playbackService?.previousNarration();referenceState()}
                "ttsNext"->{playbackService?.nextNarration();referenceState()}
                else->throw IllegalArgumentException("지원하지 않는 동작이에요.")
            };reply(result)
        }catch(e:Exception){reply(JSONObject().put("error",e.message?.take(200)?:"처리하지 못했어요."))}
    }
    private fun narrationItem(file:File):PlaybackService.NarrationItem? = runCatching {
        val r=store.load(file)
        if(r.accepted!=r.revision || r.confirmed!=r.revision || r.draftRevision!=r.revision || r.draft==null)return null
        val groups=JSONObject(r.draft).getJSONArray("groups")
        val body=(0 until groups.length()).flatMap { i->val statements=groups.getJSONObject(i).getJSONArray("statements");(0 until statements.length()).map {statements.getJSONObject(it).getString("text").trim()} }.filter {it.isNotBlank()}.joinToString("\n")
        if(body.isBlank())return null
        PlaybackService.NarrationItem(file,body,groups.optJSONObject(0)?.optString("label")?.takeIf {it.isNotBlank()}?:"그날의 일기")
    }.getOrNull()
    private fun startNarration(items:List<PlaybackService.NarrationItem>,index:Int=0){
        check(audioAllowed() && !capture.busy && !speech.busy && !syncBusy && !review.busy)
        check(review.save());check(items.isNotEmpty()) {"완성된 일기가 없어요."}
        check(items.all {narrationItem(it.file)==it}) {"일기가 변경됐어요. 목록을 새로고침한 뒤 다시 시작해 주세요."}
        val service=checkNotNull(playbackService){"음성 재생을 준비하고 있어요."}
        activeListenMode="diary";service.setSimulation(recordingService?.simulation);service.narrateQueue(items,index)
    }
    private fun startDrivingNarration(){
        val items=drivingDiaryFiles().mapNotNull(::narrationItem)
        startNarration(items,items.indexOfFirst {it.file==selected}.coerceAtLeast(0))
    }
    private fun readDiaryAloud(file:File){
        checkNotNull(narrationItem(file)){"먼저 일기를 완성해 주세요."};selectReference(file);drivingListenMode="diary";startDrivingNarration()
    }
    private fun hideKeyboard() {
        currentFocus?.let { getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(it.windowToken, 0); it.clearFocus() }
    }
    private fun month(value: String?) = runCatching { Instant.parse(value).atZone(zone).format(DateTimeFormatter.ofPattern("yyyy년 M월")) }.getOrNull()
    private fun displayDate(value: String?) = runCatching { Instant.parse(value).atZone(zone).format(date) }.getOrDefault("녹음 시각 확인 필요")
    private fun time(millis: Long) = "%02d:%02d".format(millis / 60000, (millis / 1000) % 60)
    @Deprecated("Platform back handling")
    override fun onBackPressed() {
        if(referencePage=="carsettings" && !nativeEditor){exact.evaluateJavascript("window.settingsBack?.()",null);return}
        if(nativeEditor || screen==Screen.SETTINGS){
            nativeEditor=false
            screen=when(referencePage){"carhome","recording"->Screen.RECORD;"cardetail","carreview"->Screen.DETAIL;else->Screen.LIBRARY}
            render();return // Reveal the preserved web view; do not replace its route or unsent input.
        }

        if (benchAvailable && allowed() && screen != Screen.LIBRARY && idle()) navigate(Screen.LIBRARY) else super.onBackPressed()
    }
    private fun applyAppearance() {
        if(!initialized)return
        ui.update();review.updateTheme();modal?.let {styleDialog(it)}
        exact.theme(VehicleTheme.state(this));render()
    }
    override fun onConfigurationChanged(configuration:android.content.res.Configuration) {
        super.onConfigurationChanged(configuration);applyAppearance()
    }
    private fun canImportServerSettings() = initialized && idle() && !sync.uploading &&
        ((signalMotion==VehicleInteractionPolicy.Motion.PARKED && consent.isChecked) || (gate.visibility==View.VISIBLE && signalMotion!=VehicleInteractionPolicy.Motion.DRIVING && !sync.paired))
    private fun importServerSettings() {
        if(!BuildConfig.LOCAL_MOCK || !canImportServerSettings()) {
            Toast.makeText(this,"주차 상태에서 진행 중인 작업을 마친 뒤 다시 눌러 주세요.",Toast.LENGTH_LONG).show();return
        }
        modal?.dismiss()
        modal=AlertDialog.Builder(this).setTitle("연결 서버 설정")
            .setMessage("휴대폰과 같은 가족 보관함을 사용하려면, 먼저 이 차량에 테스트 PC의 서버 주소와 인증서를 등록해야 해요.\n\nPC의 source 폴더에서 실행하세요.\nnode scripts/team-test.mjs configure-release <기기 ID>\n\n기기 ID는 adb devices에 나온 emulator-번호예요. 명령 실행 후 차량에 뜨는 확인창에서 설정 적용을 눌러 주세요.")
            .setPositiveButton("확인",null)
            .setNegativeButton("설정 직접 입력") { _,_ -> pasteServerSettings() }
            .setNeutralButton("설정 파일 선택") { _,_ -> selectServerSettingsFile() }
            .show().also {styleDialog(it)}
    }
    private fun selectServerSettingsFile() {
        if(!BuildConfig.LOCAL_MOCK || !canImportServerSettings())return
        runCatching { startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            type="*/*";addCategory(Intent.CATEGORY_OPENABLE)
        },8035) }.onFailure { pasteServerSettings() }
    }
    @Deprecated("Legacy document picker result")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode!=8035 || resultCode!=RESULT_OK)return
        if(!BuildConfig.LOCAL_MOCK || !canImportServerSettings())return
        try {
            val uri=data?.data ?: return
            val bytes=contentResolver.openInputStream(uri)?.use { stream ->
                val out=java.io.ByteArrayOutputStream();val buffer=ByteArray(4096)
                while(true){val count=stream.read(buffer);if(count<0)break;require(out.size()+count<=ServerSettings.MAX_BYTES);out.write(buffer,0,count)}
                out.toByteArray()
            } ?: error("설정 파일을 읽지 못했어요.")
            confirmServerSettings(ServerSettings.parse(bytes))
        } catch(_:Exception) {Toast.makeText(this,"설정 파일이 올바르지 않아요. PC에서 만든 chagok-server.json(32KB 이하)을 선택해 주세요.",Toast.LENGTH_LONG).show()}
    }
    private fun confirmServerSettings(settings:ServerSettings) {
        check(canImportServerSettings()){ "주차 상태에서 진행 중인 작업을 마친 뒤 다시 설정해 주세요." }
        modal?.dismiss()
        modal=AlertDialog.Builder(this).setTitle("이 테스트 서버를 사용하나요?")
            .setMessage("서버: ${settings.origin}\n\nCA SHA-256\n${settings.fingerprint}\n\n본인 PC에서 만든 서버 설정인지 확인해 주세요.")
            .setNegativeButton("취소",null).setPositiveButton("설정 적용") { _,_ ->
                try {
                    check(canImportServerSettings()){ "주차와 진행 중인 작업을 확인해 주세요." }
                    // Verify the trust boundary before stopping an existing connection.
                    if(sync.paired) check(ServerSettings.read(filesDir).certificate.encoded.contentEquals(settings.certificate.encoded)) {
                        "연결된 보관함과 다른 인증서예요. 기존 서버 설정을 사용해 주세요."
                    }
                    syncEvents.stop();sync.cancel();settings.save(filesDir,sync.paired);sync.begin()
                    syncPending=true;syncNotice="테스트 서버 설정을 적용했어요."
                    Toast.makeText(this,"테스트 서버 설정을 적용했어요.",Toast.LENGTH_LONG).show();render()
                } catch(e:Exception) {Toast.makeText(this,e.message?:"설정을 적용하지 못했어요. 기존 설정은 유지돼요.",Toast.LENGTH_LONG).show()}
            }.show().also {styleDialog(it)}
    }
    private fun pasteServerSettings() {
        val input=ui.input("서버 설정 JSON",true).apply {
            hint="PC의 chagok-server.json 내용을 붙여넣어 주세요."
            filters=arrayOf(android.text.InputFilter.LengthFilter(ServerSettings.MAX_BYTES))
        }
        val dialog=AlertDialog.Builder(this).setTitle("서버 설정 직접 입력")
            .setMessage("PC에서 내보낸 chagok-server.json 내용을 붙여넣어 주세요. 파일 선택기가 없어도 PC의 configure-release 명령으로 설정을 보낼 수 있어요.")
            .setView(input).setNegativeButton("취소",null).setPositiveButton("서버 확인",null).create()
        dialog.setOnShowListener {dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            try {val value=ServerSettings.parse(input.text.toString().toByteArray());dialog.dismiss();confirmServerSettings(value)}
            catch(_:Exception){input.error="PC에서 내보낸 유효한 설정 JSON을 입력해 주세요."}
        }}
        modal=dialog;dialog.show();styleDialog(dialog)
    }
    override fun onNewIntent(value:Intent) {super.onNewIntent(value);intent=value}
    private fun pendingServerSettings() {
        val encoded=intent?.getStringExtra("chagok_server_config") ?: return
        intent.removeExtra("chagok_server_config")
        if(!BuildConfig.LOCAL_MOCK)return
        try {
            require(encoded.length<=45000)
            confirmServerSettings(ServerSettings.parse(android.util.Base64.decode(encoded,android.util.Base64.DEFAULT)))
        } catch(_:Exception) {Toast.makeText(this,"서버 설정을 가져오지 못했어요. 주차·작업 상태와 PC의 설정을 확인해 주세요.",Toast.LENGTH_LONG).show()}
    }
    override fun onResume() {
        super.onResume();foreground=true
        if(initialized){applyAppearance();handler.post {if(foreground)pendingServerSettings()}}
        if(benchAvailable)recordingLocation.start()
        if(benchAvailable && initialized){
            playbackService?.attach(::playbackChanged)
            recordingService?.attach(::recordingChanged)
            render()
            if(capture.busy)exact.restore("recording",selected?.name)
            else if(allowed() && liveFile!=null && liveFile==selected)exact.restore("carreview",selected?.name)
            SyncUploads.request(this,sync)
            syncPending=true;handler.removeCallbacks(autoPull);handler.postDelayed(autoPull,500)
        }
    }
    override fun onPause() {
        foreground=false;handler.removeCallbacks(autoPull);syncEvents.stop();recordingLocation.close()
        vehicleLookup.cancel();vehicleLookupBusy=false
        if(benchAvailable && initialized){
            recordingService?.attach(null)
            playbackService?.attach(null);handler.removeCallbacks(ticker)
            if(!sync.uploading)sync.cancel();modal?.dismiss();review.save();review.cancel()
            if(!capture.busy && recordingService?.resultFile==null)speech.cancel()
            // The foreground microphone service, not this Activity, owns the recording.
        }
        super.onPause()
    }
    override fun onDestroy() {
        recordingService?.attach(null)
        if(serviceBound){unbindService(recordingConnection);serviceBound=false}
        playbackService?.attach(null)
        if(playbackBound){unbindService(playbackConnection);playbackBound=false}
        if(::exact.isInitialized)exact.close()
        if(::welcome.isInitialized)welcome.close()
        vehicleLookup.cancel();recordingLocation.close();syncEvents.stop()
        if(benchAvailable && initialized){++loadGeneration;++photoGeneration;handler.removeCallbacksAndMessages(null)}
        super.onDestroy()
    }
}
