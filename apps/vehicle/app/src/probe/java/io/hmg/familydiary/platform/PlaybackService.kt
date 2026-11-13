package io.hmg.familydiary.platform

import android.app.*
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.*
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.*
import ai.pleos.playground.tts.TextToSpeech
import ai.pleos.playground.tts.constant.Mode
import ai.pleos.playground.tts.constant.ErrorType
import ai.pleos.playground.tts.listener.EventListener
import ai.pleos.playground.tts.listener.OnInitializeListener
import io.hmg.familydiary.MainActivity
import io.hmg.familydiary.R
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.NarrationSegments
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion
import java.io.File
import java.util.Locale

/** Audio lifetime is independent of the screen. Never resumes after process death. */
class PlaybackService:Service() {
    data class NarrationItem(val file:File,val text:String,val title:String)
    private var queue=emptyList<NarrationItem>()
    private var originals=emptyList<File>()
    private var originalIndex=-1
    var autoAdvance=false;private set
    fun toggleAutoAdvance(){autoAdvance=!autoAdvance;emit()}
    var queueIndex=-1;private set
    val queueCount get()=queue.size
    val narrating get()=busy && queueIndex in queue.indices
    val settling get()=stopping || pauseRequested || pendingIndex!=null
    val narrationTitle get()=queue.getOrNull(queueIndex)?.title.orEmpty()
    val hasPrevious get()=narrating && queueIndex>0
    val hasNext get()=narrating && queueIndex<queue.lastIndex
    inner class LocalBinder:Binder(){val service get()=this@PlaybackService}
    private val binder=LocalBinder()
    private val handler=Handler(Looper.getMainLooper())
    private lateinit var audio:AudioManager
    private lateinit var focus:AudioFocusRequest
    private lateinit var session:MediaSession
    private var hasFocus=false
    private var foreground=false
    private var generation=0
    private var tts:TextToSpeech?=null
    private var events:EventListener?=null
    private var engineReady=false
    private var submitted=false
    private var retiring:TextToSpeech?=null
    val stopping get()=retiring!=null
    private var pendingIndex:Int?=null
    private var utterances=emptyList<String>()
    var sentenceIndex=0;private set
    var narrationPaused=false;private set
    private var pauseRequested=false
    private var elapsedBefore=0.0
    private var listener:((PlaybackService)->Unit)?=null
    private var observed=Motion.UNKNOWN
    private var simulation:Motion?=null
    private val bench get()=io.hmg.familydiary.BuildConfig.EMULATOR_BENCH && Build.HARDWARE in setOf("ranchu","goldfish")
    val motion get()=simulation?:observed
    var player:MediaPlayer?=null;private set
    var prepared=false;private set
    private var narrationStartedAt=0L
    val narrationElapsed get()=elapsedBefore+if(speaking && narrationStartedAt>0L)(SystemClock.elapsedRealtime()-narrationStartedAt)/1000.0 else 0.0
    private fun freezeClock(){elapsedBefore=narrationElapsed;narrationStartedAt=0L;speaking=false}
    var speaking=false;private set
    var busy=false;private set
    var file:File?=null;private set
    var completed=0.0;private set
    var notice="";private set
    var ducked=false;private set
    private val attributes=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private val monitor by lazy {VehicleStateMonitor(this){state,_->observed=state;if(motion==Motion.UNKNOWN)stop("차량 상태를 확인할 수 없어 재생을 멈췄어요.")}}
    override fun onCreate(){
        super.onCreate();audio=getSystemService(AudioManager::class.java)
        focus=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes)
            .setWillPauseWhenDucked(false).setOnAudioFocusChangeListener({change->
                handleFocus(change)
            },handler).build()
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("playback","목소리와 일기 듣기",NotificationManager.IMPORTANCE_LOW))
        session=MediaSession(this,"ChagokPlayback").apply {
            setCallback(object:MediaSession.Callback(){
                override fun onStop(){stop("재생을 종료했어요.")}
                override fun onPause(){if(prepared && player?.isPlaying==true)toggle() else if(narrating && speaking)toggleNarration()}
                override fun onPlay(){if(prepared && player?.isPlaying==false)toggle() else if(narrationPaused)toggleNarration()}
                override fun onSkipToNext(){nextNarration()}
                override fun onSkipToPrevious(){previousNarration()}
                override fun onSeekTo(pos:Long){if(prepared && motion!=Motion.UNKNOWN)player?.seekTo(pos.coerceIn(0,player!!.duration.toLong()).toInt())}
            },handler)
        }
        monitor.start()
    }
    private fun handleFocus(change:Int){
                when(change){
                    AudioManager.AUDIOFOCUS_LOSS,AudioManager.AUDIOFOCUS_LOSS_TRANSIENT->{hasFocus=false;stop("다른 오디오가 시작되어 재생을 멈췄어요.")}
                    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK->{
                        // TTS SDK exposes no app-side gain. Stop narration rather than masking guidance.
                        if(narrating)stop("안내 음성을 위해 일기 읽기를 멈췄어요.")
                        else {ducked=true;player?.setVolume(.2f,.2f);emit()}
                    }
                    AudioManager.AUDIOFOCUS_GAIN->{ducked=false;player?.setVolume(1f,1f);emit()}
                }
    }
    fun attach(value:((PlaybackService)->Unit)?){listener=value;value?.invoke(this)}
    fun setSimulation(value:Motion?){check(bench);simulation=value;if(motion==Motion.UNKNOWN)stop("차량 상태를 확인할 수 없어 재생을 멈췄어요.")}
    private fun startSession(original:File){
        check(bench && motion!=Motion.UNKNOWN){"차량 상태를 먼저 확인해 주세요."}
        check(!stopping){"이전 음성을 종료하고 있어요. 잠시 후 다시 눌러 주세요."}
        stop("")
        check(!stopping){"이전 음성을 종료하고 있어요. 잠시 후 다시 눌러 주세요."}
        file=original;busy=true;completed=0.0;notice="재생 준비 중"
        try {
            startForegroundService(Intent(this,PlaybackService::class.java).setAction("keep"))
            foreground=true
            if(Build.VERSION.SDK_INT>=29)startForeground(311,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) else startForeground(311,notification())
            hasFocus=audio.requestAudioFocus(focus)==AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            check(hasFocus){"지금은 오디오를 사용할 수 없어요."}
            session.isActive=true
        }catch(e:Exception){stop(e.message?:"재생하지 못했어요.");throw e}
    }
    fun play(original:File,positionMs:Int=0){
        PcmWave.payloadBytes(original);startSession(original);val token=generation
        try {
            player=MediaPlayer().apply {
                setAudioAttributes(attributes);setDataSource(original.absolutePath)
                setOnPreparedListener {p->
                    if(token!=generation)return@setOnPreparedListener
                    if(!hasFocus || motion==Motion.UNKNOWN){stop("재생할 수 없는 상태예요.");return@setOnPreparedListener}
                    prepared=true;p.seekTo(positionMs.coerceIn(0,p.duration));p.start();notice="원본 듣는 중";emit()
                }
                setOnCompletionListener {p->if(token==generation){
                    val end=p.duration/1000.0;val rows=originals;val next=if(originalIndex==rows.lastIndex)0 else originalIndex+1
                    val advance=autoAdvance && hasFocus && motion!=Motion.UNKNOWN && originalIndex>=0 && next in rows.indices
                    stop("원본 재생 완료");completed=end
                    if(advance)playQueue(rows,next) else emit()
                }}
                setOnErrorListener {_,_,_->if(token==generation)stop("재생하지 못했어요. 원본은 보관돼 있어요.");true}
                prepareAsync()
            }
            emit()
        }catch(_:Exception){stop("원본을 재생하지 못했어요.")}
    }
    fun playQueue(items:List<File>,index:Int,positionMs:Int=0){
        require(index in items.indices && items.distinct().size==items.size)
        play(items[index],positionMs);originals=items.toList();originalIndex=index
    }
    fun toggle(){
        val p=player?:run{toggleNarration();return}
        if(!prepared || motion==Motion.UNKNOWN)return
        if(p.isPlaying){p.pause();notice="재생 일시정지"}
        else if(hasFocus){p.start();notice="원본 듣는 중"}
        emit()
    }
    fun toggleNarration(){
        if(!narrating || settling || !engineReady || !hasFocus || motion==Motion.UNKNOWN)return
        if(narrationPaused){narrationPaused=false;speakCurrent(false);return}
        if(!speaking)return
        pauseRequested=true;notice="일기 읽기를 잠시 멈추고 있어요."
        handler.removeCallbacks(timeout);handler.postDelayed(timeout,20000)
        try{tts?.stop()}catch(_:Exception){stop("일시정지를 완료하지 못했어요.")};emit()
    }
    private fun confirmPause(){
        freezeClock();pauseRequested=false;narrationPaused=true;submitted=false
        generation++;events?.let{runCatching{tts?.removeEventListener(it)}};events=null
        handler.removeCallbacks(timeout);notice="일기 일시정지 · 현재 문장부터 이어 읽어요.";emit()
    }
    fun narrate(original:File,text:String){
        narrateQueue(listOf(NarrationItem(original,text,"일기")))
    }
    fun narrateQueue(items:List<NarrationItem>,startIndex:Int=0){
        require(items.isNotEmpty() && startIndex in items.indices)
        require(items.all { it.text.isNotBlank() } && items.map { it.file }.distinct().size==items.size)
        startSession(items[startIndex].file)
        queue=items.toList();queueIndex=startIndex
        notice="일기 준비 중 · ${queueIndex+1}/$queueCount"
        val token=generation
        try {
            val engine=TextToSpeech(applicationContext,Mode.ON_DEVICE);tts=engine
            handler.postDelayed(timeout,20000)
            engine.initialize(object:OnInitializeListener {
                override fun onSuccess(){handler.post{if(token==generation){
                    try{engine.setAudioAttributes(attributes);engine.setLocale(Locale.KOREA);engineReady=true;speakCurrent()}
                    catch(_:Exception){stop("일기 읽기를 시작하지 못했어요.")}
                } else runCatching{engine.release()}}}
                override fun onFailure(errorType:ErrorType){handler.post{if(token==generation)stop("음성 엔진 연결 실패 ($errorType)")}}
            });emit()
        }catch(_:Exception){stop("공식 음성 엔진을 사용할 수 없어요.")}
    }
    fun nextNarration(){if(hasNext)moveNarration(queueIndex+1)}
    fun previousNarration(){if(hasPrevious)moveNarration(queueIndex-1)}
    private fun moveNarration(index:Int){
        if(!narrating || settling || !hasFocus || motion==Motion.UNKNOWN)return
        if(narrationPaused){queueIndex=index;file=queue[index].file;utterances=NarrationSegments.split(queue[index].text);sentenceIndex=0;elapsedBefore=0.0;emit();return}
        if(!engineReady){queueIndex=index;file=queue[index].file;emit();return}
        val waiting=pendingIndex!=null;pendingIndex=index
        if(!waiting){
            notice="다음 일기를 준비하고 있어요.";speaking=false
            handler.removeCallbacks(timeout);handler.postDelayed(timeout,20000)
            try{tts?.stop()}catch(_:Exception){stop("일기 이동을 완료하지 못했어요.")};emit()
        }
    }
    private fun releaseNarration(terminal:Boolean=false){
        generation++;handler.removeCallbacks(timeout)
        val engine=tts;val callback=events;val needsStop=submitted && !terminal
        tts=null;events=null;speaking=false;narrationStartedAt=0L;elapsedBefore=0.0;engineReady=false;pendingIndex=null;submitted=false;pauseRequested=false;narrationPaused=false;utterances=emptyList();sentenceIndex=0
        if(engine==null)return
        runCatching{if(callback!=null)engine.removeEventListener(callback)}
        if(!needsStop){runCatching{engine.release()};return}
        // SDK 3.3.1 stop() schedules a coroutine; immediate release() disconnects
        // its binder before that coroutine reaches the synthesis service.
        retiring=engine
        val end=object:EventListener {
            private fun finish(){handler.post{
                if(retiring!==engine)return@post
                handler.removeCallbacks(stopTimeout)
                runCatching{engine.removeEventListener(this)}
                runCatching{engine.release()}
                retiring=null;busy=false;notice="재생을 종료했어요.";endForeground();emit()
            }}
            override fun onReady()=Unit
            override fun onStart(){runCatching{engine.stop()}}
            override fun onUpdatedRms(rms:Double)=Unit
            override fun onStop()=finish()
            override fun onDone()=finish()
            override fun onError(errorType:ErrorType)=finish()
        }
        engine.addEventListener(end)
        runCatching{engine.stop()}
        handler.postDelayed(stopTimeout,3000)
    }
    private val stopTimeout=Runnable {
        retiring?.let { engine ->
            // Do not claim silence or disconnect before acknowledgement.
            runCatching{engine.stop()}
            notice="음성 종료를 확인하고 있어요.";emit()
        }
    }
    private fun endForeground(){
        if(foreground){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();foreground=false}
    }
    private fun speakCurrent(resetItem:Boolean=true){
        if(!hasFocus || motion==Motion.UNKNOWN){stop("재생할 수 없는 상태예요.");return}
        val engine=tts?:return
        if(resetItem){utterances=NarrationSegments.split(queue[queueIndex].text);sentenceIndex=0;elapsedBefore=0.0}
        generation++;handler.removeCallbacks(timeout);speaking=false;narrationStartedAt=0L;pendingIndex=null;narrationPaused=false
        events?.let {runCatching{engine.removeEventListener(it)}}
        val item=queue[queueIndex];file=item.file;notice="일기 준비 중 · ${queueIndex+1}/$queueCount"
        val token=generation
        val callback=object:EventListener {
            private fun update(action:()->Unit){handler.post{if(token==generation)action()}}
            override fun onReady()=Unit
            override fun onStart(){update{if(pendingIndex==null){speaking=true;narrationStartedAt=SystemClock.elapsedRealtime();notice="일기 읽는 중 · ${queueIndex+1}/$queueCount";handler.removeCallbacks(timeout);emit()}}}
            override fun onUpdatedRms(rms:Double)=Unit
            override fun onDone(){update{
                if(pendingIndex!=null)return@update // Explicit skip waits for the matching stop acknowledgement.
                if(pauseRequested){confirmPause();return@update}
                freezeClock();submitted=false
                if(!hasFocus || motion==Motion.UNKNOWN)stop("재생할 수 없는 상태예요.")
                else if(sentenceIndex<utterances.lastIndex){sentenceIndex++;speakCurrent(false)}
                else if(autoAdvance){queueIndex=if(hasNext)queueIndex+1 else 0;speakCurrent()} else stop("일기 목록을 모두 들었어요.",terminal=true)
            }}
            override fun onStop(){update{
                if(pauseRequested){confirmPause();return@update}
                val next=pendingIndex
                if(next!=null && hasFocus && motion!=Motion.UNKNOWN){queueIndex=next;speakCurrent()}
                else stop("일기 읽기를 멈췄어요.",terminal=true)
            }}
            override fun onError(errorType:ErrorType){update{stop("일기를 읽지 못했어요. ($errorType)")}}
        }
        events=callback
        handler.postDelayed(timeout,20000)
        try{engine.addEventListener(callback);submitted=true;engine.speak(utterances[sentenceIndex]);emit()}
        catch(_:Exception){stop("일기 읽기를 시작하지 못했어요.")}
    }
    private val timeout=Runnable {if(busy && (!speaking || pauseRequested))stop("음성 엔진 응답이 지연돼요. 다시 시도해 주세요.")}
    fun stop(message:String="재생을 종료했어요.",terminal:Boolean=false){
        releaseNarration(terminal);queue=emptyList();queueIndex=-1;originals=emptyList();originalIndex=-1
        runCatching{player?.release()};player=null;prepared=false;speaking=false;busy=stopping;ducked=false;completed=0.0
        if(::focus.isInitialized)audio.abandonAudioFocusRequest(focus);hasFocus=false
        if(::session.isInitialized)session.isActive=false
        if(!stopping)endForeground()
        notice=if(stopping)"음성을 종료하고 있어요." else message;emit()
    }
    private fun emit(){
        if(::session.isInitialized)session.setPlaybackState(PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_STOP or PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
                (if(narrating) (if(hasPrevious)PlaybackState.ACTION_SKIP_TO_PREVIOUS else 0L) or (if(hasNext)PlaybackState.ACTION_SKIP_TO_NEXT else 0L)
                else PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_SEEK_TO))
            .setState(if(speaking||prepared&&player?.isPlaying==true)PlaybackState.STATE_PLAYING else if(busy)PlaybackState.STATE_PAUSED else PlaybackState.STATE_STOPPED,
                if(prepared)player?.currentPosition?.toLong()?:0 else 0,1f).build())
        if(foreground)getSystemService(NotificationManager::class.java).notify(311,notification())
        listener?.invoke(this)
    }
    private fun notification():Notification {
        val open=PendingIntent.getActivity(this,2,Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val stop=PendingIntent.getService(this,3,Intent(this,PlaybackService::class.java).setAction("stop"),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val builder=Notification.Builder(this,"playback").setSmallIcon(R.drawable.ic_family_diary).setContentTitle("차곡 · 목소리와 일기 듣기")
            .setContentText(notice).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
                    var count=0
        fun action(label:String,command:String,request:Int){
            val intent=PendingIntent.getService(this,request,Intent(this,PlaybackService::class.java).setAction(command),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            builder.addAction(Notification.Action.Builder(null,label,intent).build());count++
        }
        if(hasPrevious)action("이전 일기","previous",4)
        builder.addAction(Notification.Action.Builder(null,"재생 종료",stop).build());count++
        if(hasNext)action("다음 일기","next",5)
        return builder.setStyle(Notification.MediaStyle().setMediaSession(session.sessionToken).setShowActionsInCompactView(*(0 until count).toList().toIntArray())).build()
    }
    override fun onBind(intent:Intent)=binder
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {when(intent?.action){"stop"->stop();"previous"->previousNarration();"next"->nextNarration()};if(!busy)stopSelf();return START_NOT_STICKY}
    override fun onTaskRemoved(rootIntent:Intent?){stop();super.onTaskRemoved(rootIntent)}
    override fun onDestroy(){listener=null;monitor.close();stop();session.release();super.onDestroy()}
}
