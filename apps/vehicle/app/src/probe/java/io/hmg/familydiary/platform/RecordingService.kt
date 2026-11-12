package io.hmg.familydiary.platform

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.os.*
import io.hmg.familydiary.MainActivity
import io.hmg.familydiary.R
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import java.io.File

/** Owns the microphone, STT and durable result. No Activity or WebView references. */
class RecordingService:Service() {
    inner class LocalBinder:Binder(){val service get()=this@RecordingService}
    private val binder=LocalBinder()
    private val handler=Handler(Looper.getMainLooper())
    lateinit var capture:CaptureProbe;private set
    lateinit var speech:SpeechProbe;private set
    private lateinit var store:ReviewStore
    private lateinit var contexts:MemoryContextStore
    private lateinit var audio:AudioManager
    private lateinit var focus:AudioFocusRequest
    private var hasFocus=false
    private var started=false
    private var finalizing=false
    val settling:Boolean get()=finalizing
    private var transcriptApplied=false
    private var listener:((RecordingService)->Unit)?=null
    var elapsed=0L;private set
    var level=0f;private set
    var text="";private set
    var speechStatus="";private set
    var notice="";private set
    var resultFile:File?=null;private set
    var consent=false;private set
    var motion=Motion.UNKNOWN;private set
    var source="차량 신호 연결 중";private set
    var simulation:Motion?=null;private set
    private var observed=Motion.UNKNOWN
    private var observedSource="차량 상태 확인 필요"
    private val bench get()=io.hmg.familydiary.BuildConfig.EMULATOR_BENCH && Build.HARDWARE in setOf("ranchu","goldfish")
    private val monitor by lazy { VehicleStateMonitor(this) { state,label->
        observed=state;observedSource=label;applyMotion()
    } }
    private val recordingCallback=object:AudioManager.AudioRecordingCallback(){
        override fun onRecordingConfigChanged(configs:MutableList<AudioRecordingConfiguration>){
            if(Build.VERSION.SDK_INT>=29 && capture.busy && configs.any{it.clientAudioSessionId==capture.sessionId && it.isClientSilenced})
                interrupt("다른 앱이 마이크를 사용해 녹음을 보관했어요.")
        }
    }
    override fun onCreate(){
        super.onCreate()
        capture=CaptureProbe(File(filesDir,"capture-probe"));speech=SpeechProbe(applicationContext)
        store=ReviewStore(File(filesDir,"capture-review"));contexts=MemoryContextStore(File(filesDir,"memory-context"))
        audio=getSystemService(AudioManager::class.java)
        focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setWillPauseWhenDucked(false).setOnAudioFocusChangeListener({change->
                when(change){
                    AudioManager.AUDIOFOCUS_LOSS,AudioManager.AUDIOFOCUS_LOSS_TRANSIENT->{hasFocus=false;interrupt("오디오 사용이 중단되어 녹음을 보관했어요.")}
                    // Navigation ducking affects output, not saved microphone PCM.
                    AudioManager.AUDIOFOCUS_GAIN,AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> Unit
                }
            },handler).build()
        audio.registerAudioRecordingCallback(recordingCallback,handler)
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("recording","녹음 상태",NotificationManager.IMPORTANCE_LOW))
        monitor.start()
    }
    fun attach(value:((RecordingService)->Unit)?){listener=value;value?.invoke(this)}
    fun setConsent(value:Boolean){consent=value;if(!value)interrupt("공동 녹음 동의가 해제되어 중단했어요.");emit()}
    fun setSimulation(value:Motion?){check(bench);simulation=value;applyMotion()}
    private fun applyMotion(){
        motion=simulation?:observed
        source=if(simulation!=null)"모의 ${motion.name} · 시험 상태" else observedSource
        if(motion==Motion.UNKNOWN)interrupt("차량 상태를 확인할 수 없어 녹음을 보관했어요.")
        emit()
    }
    // Also lets isolated instrumentation supply its private synthetic storage.
    fun configure(input:CaptureProbe,reviews:ReviewStore,metadata:MemoryContextStore){
        check(!capture.busy && !finalizing);capture=input;store=reviews;contexts=metadata
    }
    fun begin(snapshot:MemoryContext){
        check(bench && consent && motion!=Motion.UNKNOWN && !capture.busy && !finalizing){"차량 상태와 녹음 안내를 확인해 주세요."}
        elapsed=0;level=0f;text="";speechStatus="음성 인식 준비 중";resultFile=null;transcriptApplied=false;notice=""
        // Called by a foreground user action, while microphone permission is in use.
        startForegroundService(Intent(this,RecordingService::class.java).setAction("keep"))
        started=true
        if(Build.VERSION.SDK_INT>=29)startForeground(310,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(310,notification())
        try {
            hasFocus=audio.requestAudioFocus(focus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            check(hasFocus){"지금은 마이크를 사용할 수 없어요."}
            speech.startLive(onStatus={speechStatus=it.substringBefore('\n');emit()},onUpdate={text=it;emit()},onDone={saveTranscript();settle();emit()})
            capture.start(onPcm={speech.feed(it)},onLevel={level=it;emit()},onProgress={elapsed=it;emit()},onResult={result->
                level=0f;finalizing=true
                resultFile=result.file
                notice=if(result.error!=null)"원본 보관에 실패했어요. 미완료 파일을 남겨 두었어요." else if(result.interrupted)"녹음을 중단하고 원본을 보관했어요." else "원본을 보관했어요. 주차 후 이야기를 확인해 주세요."
                result.file?.let { file -> runCatching {
                    store.save(store.load(file).copy(recordedAt=snapshot.startedAt));contexts.create(file.name,snapshot)
                }.onFailure{notice="원본은 보관됐지만 차량·시각 저장을 확인해야 해요."} }
                if(result.interrupted || result.file==null)speech.cancel() else speech.finishLive()
                saveTranscript();settle();emit()
            })
            emit()
        }catch(e:Exception){speech.cancel();notice=e.message?:"녹음을 시작하지 못했어요.";finalizing=true;settle();emit();throw e}
    }
    fun pauseOrResume(){capture.pauseOrResume();notifyState();emit()}
    fun finish(){capture.stop(false)}
    fun interrupt(message:String){
        if(capture.busy || finalizing){notice=message;capture.stop(true);speech.cancel();saveTranscript();settle();emit()}
    }
    private fun saveTranscript(){
        val file=resultFile?:return
        if(speech.busy || transcriptApplied || text.isBlank())return
        runCatching{store.save(store.load(file).withSpeech(text,speech.segments));transcriptApplied=true}.onFailure{speechStatus="인식문 저장을 확인해 주세요. 원본은 보관돼요."}
    }
    private fun settle(){
        if(capture.busy || speech.busy || !finalizing)return
        saveTranscript();finalizing=false
        if(hasFocus)audio.abandonAudioFocusRequest(focus)
        hasFocus=false
        if(started){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();started=false}
    }
    private fun emit(){listener?.invoke(this)}
    private fun notification():Notification {
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop=PendingIntent.getService(this,1,Intent(this,RecordingService::class.java).setAction("finish"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this,"recording").setSmallIcon(R.drawable.ic_family_diary).setContentTitle(if(capture.paused)"차곡 · 녹음 일시정지" else "차곡 · 녹음 중")
            .setContentText("내비를 보면서도 녹음이 이어져요").setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(null,"녹음 마치기",stop).build()).build()
    }
    private fun notifyState(){if(started)getSystemService(NotificationManager::class.java).notify(310,notification())}
    override fun onBind(intent:Intent)=binder
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int{
        if(intent?.action=="finish")finish()
        if(!capture.busy && !finalizing)stopSelf()
        return START_NOT_STICKY
    }
    override fun onTaskRemoved(rootIntent:Intent?){interrupt("앱을 닫아 녹음을 보관했어요.");super.onTaskRemoved(rootIntent)}
    override fun onDestroy(){
        listener=null;monitor.close();audio.unregisterAudioRecordingCallback(recordingCallback)
        capture.stop(true);speech.cancel();saveTranscript();if(hasFocus)audio.abandonAudioFocusRequest(focus)
        super.onDestroy()
    }
}
