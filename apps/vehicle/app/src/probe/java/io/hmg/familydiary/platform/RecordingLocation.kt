package io.hmg.familydiary.platform

import android.content.Context
import android.os.Handler
import android.os.Looper
import ai.pleos.playground.location.fused.FusedLocation
import ai.pleos.playground.location.fused.listener.FusedLocationListener
import ai.pleos.playground.location.fused.model.LocationData
import org.json.JSONObject
import java.time.Instant
import java.util.Locale

data class RecordedLocation(val status:String="unavailable",val observedAt:String?=null,
    val latitude:Double?=null,val longitude:Double?=null,val source:String?=null,val confidence:Double?=null) {
    fun label():String = when(status) {
        "available" -> String.format(Locale.ROOT,"%.5f, %.5f",latitude,longitude)
        "synthetic" -> "샘플 나들이 주차장"
        "stale" -> "최근 위치를 확인하지 못했어요"
        "denied" -> "위치 접근 권한 없음"
        "unsupported" -> "이 환경은 위치 조회 미지원"
        "error" -> "위치를 확인하지 못했어요"
        else -> "위치 미수집"
    }
    fun json():JSONObject = JSONObject().put("status",status).put("observed_at",observedAt?:JSONObject.NULL)
        .put("label",if(status in setOf("available","synthetic"))label() else JSONObject.NULL).apply {
            if(status=="available") {
                put("latitude",latitude);put("longitude",longitude);put("source",source)
                put("confidence",confidence?:JSONObject.NULL)
            }
        }
    companion object {
        fun read(j:JSONObject)=RecordedLocation(j.optString("status","unavailable"),j.optString("observed_at").takeUnless{it.isBlank()||it=="null"},
            if(j.isNull("latitude"))null else j.getDouble("latitude"),if(j.isNull("longitude"))null else j.getDouble("longitude"),
            j.optString("source").takeUnless{it.isBlank()||it=="null"},if(j.isNull("confidence"))null else j.getDouble("confidence"))
    }
}

/** Foreground subscription; callbacks never log coordinates or revise existing memories. */
class RecordingLocation(context:Context) {
    private val app=context.applicationContext
    private val handler=Handler(Looper.getMainLooper())
    private var sdk:FusedLocation?=null
    private var callback:FusedLocationListener?=null
    private var generation=0
    private var observation:LocationData?=null
    var status="unavailable";private set
    fun start() {
        if(app.checkSelfPermission("pleos.car.permission.FUSED_LOCATION")!=android.content.pm.PackageManager.PERMISSION_GRANTED){status="denied";return}
        if(sdk!=null)return
        val token=++generation
        try {
            val location=FusedLocation(app)
            if(!location.isSupported()){status="unsupported";return}
            sdk=location;location.initialize()
            val listener=object:FusedLocationListener {
                override fun onChanged(value:LocationData?) {handler.post {if(token==generation){observation=value;status=if(value==null)"unavailable" else "available"}}}
                override fun onError(exception:Exception){handler.post {if(token==generation){observation=null;status=if(exception is SecurityException)"denied" else "error"}}}
            }
            callback=listener;location.registerFusedLocationCallback(listener);location.getLastKnownLocation(listener)
        }catch(_:SecurityException){close();status="denied"}
         catch(_:Exception){close();status="error"}
         catch(_:LinkageError){close();status="unsupported"}
    }
    fun snapshot(startedAtMs:Long):RecordedLocation {
        val value=observation?:return RecordedLocation(status)
        val validity=RecordingLocationPolicy.status(startedAtMs,value.timestampMillis,value.latitude,value.longitude)
        if(validity!="available")return RecordedLocation(validity)
        return RecordedLocation("available",Instant.ofEpochMilli(value.timestampMillis).toString(),value.latitude,value.longitude,
            "pleos_fused_emulator",value.confidence.toDouble().takeIf{it.isFinite()})
    }
    fun close(){
        generation++;callback?.let{runCatching{sdk?.unregisterFusedLocationCallback(it)}}
        runCatching{sdk?.release()};sdk=null;callback=null;observation=null;status="unavailable"
    }
}
