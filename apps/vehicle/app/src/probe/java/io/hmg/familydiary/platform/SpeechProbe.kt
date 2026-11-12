package io.hmg.familydiary.platform

import android.content.Context
import android.os.Handler
import android.os.Looper
import ai.pleos.playground.stt.SpeechToText
import ai.pleos.playground.stt.constant.ErrorType
import ai.pleos.playground.stt.constant.Mode
import ai.pleos.playground.stt.listener.OnInitializeListener
import ai.pleos.playground.stt.listener.ResultListener
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.capture.SpeechAlignment
import io.hmg.familydiary.capture.SpeechSegment
import java.io.File
import java.io.RandomAccessFile
import java.util.Locale
import java.util.TreeMap

/** First EPD per explicit PCM window. Replay the unconsumed tail after each SDK reset.
 * The recorder writes exactly these PCM bytes; pauses add neither bytes nor offsets.
 * No second microphone, wall-clock timestamps, sentence-length estimates or LLM alignment.
 */
class SpeechProbe(private val context:Context) {
    private val handler=Handler(Looper.getMainLooper())
    private val lock=Object()
    @Volatile private var generation=0
    @Volatile private var window=0
    private var sdk:SpeechToText?=null
    private var listener:ResultListener?=null
    private var sender:Thread?=null
    @Volatile var busy=false;private set
    private val chunks=TreeMap<Long,ByteArray>()
    private var inputBytes=0L
    private var inputComplete=false
    private var source:File?=null
    private var base=0L
    private val committed=mutableListOf<SpeechSegment>()
    private val finals=mutableListOf<String>()
    private var partial=""
    val segments:List<SpeechSegment> get()=committed.toList()+finals.map{SpeechSegment(it)}+if(partial.isNotBlank())listOf(SpeechSegment(partial))else emptyList()
    private val text get()=segments.joinToString("\n"){it.text}
    private var status:(String)->Unit={}
    private var done:()->Unit={}
    private var result:(String)->Unit={}
    private var update:(String)->Unit={}

    fun startLive(onStatus:(String)->Unit,onDone:()->Unit,onUpdate:(String)->Unit)=begin(null,onStatus,onDone,{},onUpdate)
    fun run(file:File?,onStatus:(String)->Unit,onDone:()->Unit,onResult:(String)->Unit={})=begin(file,onStatus,onDone,onResult,{})
    fun feed(bytes:ByteArray){
        synchronized(lock){
            if(!busy || inputComplete || source!=null)return
            if(inputBytes+bytes.size>21L*60*PcmWave.BYTES_PER_SECOND){val token=generation;handler.post{if(token==generation)finish("STT 입력 한도 · 원본은 보관돼요.")};return}
            chunks[inputBytes]=bytes.copyOf();inputBytes+=bytes.size;lock.notifyAll()
        }
    }
    fun finishLive(){synchronized(lock){inputComplete=true;lock.notifyAll()}}
    private fun begin(file:File?,onStatus:(String)->Unit,onDone:()->Unit,onResult:(String)->Unit,onUpdate:(String)->Unit){
        cancel();committed.clear();finals.clear();partial="";base=0;source=file
        synchronized(lock){chunks.clear();inputBytes=file?.let{PcmWave.payloadBytes(it)}?:0L;inputComplete=file!=null}
        status=onStatus;done=onDone;result=onResult;update=onUpdate;busy=true
        openWindow()
    }
    private fun publish(){update(text);status("인식 중 · 확정 ${committed.size+finals.size}개 구간\n$text")}
    private fun finish(message:String){
        if(!busy)return
        val value=text;val callback=done;val output=result
        status("$message\n$value");update(value);cancel()
        if(value.isNotBlank())output(value)
        callback()
    }
    private fun finishInput(){finish(if(partial.isNotBlank())"STT 종료 · 최종 확정 미수신 구간 있음" else if(segments.isNotEmpty())"STT 최종 결과 수신 · ${segments.size}개 구간" else "STT 종료 · 인식문 없음")}
    private fun releaseEngine(){
        window++;sender?.interrupt();sender=null
        synchronized(lock){
            runCatching{listener?.let{sdk?.removeListener(it)}};runCatching{sdk?.stop()};runCatching{sdk?.release()}
            listener=null;sdk=null;lock.notifyAll()
        }
    }
    private fun openWindow(){
        if(!busy)return
        if(inputComplete && base>=inputBytes){finishInput();return}
        val session=generation;val request=++window
        fun current()=busy && session==generation && request==window
        fun event(action:()->Unit){handler.post{if(current())action()}}
        var sent=0L
        var eof=false
        var ended=false
        var epd:Pair<Long,Long>?=null
        var settle=0
        fun settleInput(){
            if(!eof)return
            val revision=++settle
            handler.postDelayed({if(current() && revision==settle)finishInput()},if(ended)500 else 5000)
        }
        fun commitFirst(){
            val pair=epd?:return
            if(finals.size!=1 || partial.isNotBlank())return
            val segment=SpeechAlignment.first(finals[0],base,pair.first,pair.second,synchronized(lock){sent})
            if(segment.startMs==null)return // Keep text without a made-up time when the SDK result is ambiguous.
            committed.add(segment);finals.clear();partial=""
            base+=pair.second
            releaseEngine()
            synchronized(lock){while(chunks.isNotEmpty()){val first=checkNotNull(chunks.firstEntry());if(first.key+first.value.size>base)break;chunks.pollFirstEntry()}}
            publish()
            handler.postDelayed({if(busy && generation==session)openWindow()},200)
        }
        status("Pleos ON_DEVICE 연결 중")
        val speech=try{SpeechToText(context.applicationContext,Mode.ON_DEVICE)}catch(_:Exception){finish("STT 객체 생성 실패 · 원본 보존");return}
        sdk=speech
        val callback=object:ResultListener {
            override fun onReady()=Unit
            override fun onStartedRecognition()=event{ended=false;settle++}
            override fun onUpdated(stt:String,completed:Boolean)=event{
                if(completed){if(stt.isNotBlank())finals.add(stt);partial=""}else partial=stt
                publish();commitFirst();settleInput()
            }
            override fun onUpdatedEpdData(on:Long,off:Long)=event{if(finals.size<=1 && on>=0 && off>on)epd=on to off;commitFirst()}
            override fun onUpdatedRms(rms:Double)=Unit
            override fun onEndedRecognition()=event{ended=true;settleInput()}
            override fun onError(errorType:ErrorType)=event{finish("STT 실패 · ${errorType.name} · 원본 보존")}
        }
        listener=callback
        handler.postDelayed({if(current() && sender==null)finish("STT 초기화 시간 초과 · 원본 보존")},15000)
        try{speech.initialize(object:OnInitializeListener {
            override fun onFailure(errorType:ErrorType)=event{finish("STT 초기화 실패 · ${errorType.name}")}
            override fun onSuccess()=event{
                try{
                    speech.setLocale(Locale.KOREA);speech.addListener(callback)
                    status(if(source!=null)"저장한 원본 PCM 전송 중 · $base bytes부터" else "녹음과 함께 글로 옮기고 있어요")
                    val origin=base
                    sender=Thread({
                        val file=source?.let{RandomAccessFile(it,"r")}
                        var cursor=origin
                        try{
                            while(current()){
                                val bytes=synchronized(lock){
                                    while(current() && cursor>=inputBytes && !inputComplete)lock.wait(100)
                                    if(!current())throw InterruptedException()
                                    if(cursor>=inputBytes)null
                                    else if(file!=null){file.seek(PcmWave.HEADER_BYTES+cursor);ByteArray(minOf(3200L,inputBytes-cursor).toInt()).also{file.readFully(it)}}
                                    else {val part=checkNotNull(chunks.floorEntry(cursor));val offset=(cursor-part.key).toInt();part.value.copyOfRange(offset,minOf(part.value.size,offset+3200))}
                                }?:break
                                synchronized(lock){if(!current())throw InterruptedException();speech.sendAudio(bytes);cursor+=bytes.size;sent=cursor-origin}
                                Thread.sleep(bytes.size*1000L/PcmWave.BYTES_PER_SECOND)
                            }
                            synchronized(lock){if(current())speech.completeAudioSend()}
                            event{eof=true;settleInput()}
                        }catch(_:InterruptedException){}catch(_:Exception){event{finish("STT PCM 전송 실패 · 원본 보존")}}finally{file?.close()}
                    },"speech-probe").also{it.start()}
                }catch(_:Exception){finish("STT 설정 실패 · 원본 보존")}
            }
        })}catch(_:Exception){finish("STT 초기화 호출 실패 · 원본 보존")}
    }
    fun cancel(){generation++;busy=false;releaseEngine();handler.removeCallbacksAndMessages(null);synchronized(lock){chunks.clear()}}
}
