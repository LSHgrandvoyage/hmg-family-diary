package io.hmg.familydiary.platform

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Handler
import android.os.Looper
import javax.net.ssl.HttpsURLConnection

/** Reconnects the SSE stream, never periodically polls diary data. */
class SyncEvents(context:Context, private val sync:()->CloudSync, private val changed:()->Unit, private val status:(String)->Unit) {
    private val handler=Handler(Looper.getMainLooper())
    private val network=context.getSystemService(ConnectivityManager::class.java)
    @Volatile private var generation=0
    @Volatile private var connection:HttpsURLConnection?=null
    @Volatile var eventsReceived=0;private set
    private var active=false
    private var attempt=0
    private val reconnect=Runnable { connect() }
    private val callback=object:ConnectivityManager.NetworkCallback() {
        override fun onAvailable(n:Network) {handler.post {if(active && connection==null){handler.removeCallbacks(reconnect);connect()}}}
    }
    fun start() {
        if(active || !sync().paired)return
        active=true;attempt=0
        runCatching{network.registerDefaultNetworkCallback(callback)}
        changed();connect()
    }
    fun stop() {
        if(!active)return
        active=false;generation++;handler.removeCallbacks(reconnect)
        connection?.disconnect();connection=null
        runCatching{network.unregisterNetworkCallback(callback)}
    }
    private fun connect() {
        if(!active || connection!=null)return
        if(!sync().paired){stop();return}
        val token=++generation
        // Sentinel is assigned on the main thread before launching to avoid duplicate starts.
        val conn=runCatching{sync().eventConnection()}.getOrElse{retry();return}
        connection=conn
        Thread({
            var openedAt=0L
            try {
                check(conn.responseCode==200)
                check(conn.contentType?.startsWith("text/event-stream")==true)
                openedAt=android.os.SystemClock.elapsedRealtime()
                handler.post {if(token==generation)status("")}
                conn.inputStream.bufferedReader().use { reader ->
                    var event=""
                    while(token==generation) {
                        val line=reader.readLine()?:break
                        require(line.length<4096)
                        if(line.startsWith("event: "))event=line.substring(7)
                        if(line.isEmpty()) {
                            if(event in setOf("ready","changed","unauthorized")){eventsReceived++;handler.post{if(token==generation)changed()}}
                            if(event=="unauthorized")break
                            event=""
                        }
                    }
                }
            }catch(_:Exception){}finally {
                conn.disconnect()
                handler.post {
                    if(token==generation){connection=null;if(openedAt>0 && android.os.SystemClock.elapsedRealtime()-openedAt>20000)attempt=0;retry()}
                }
            }
        },"diary-events").start()
    }
    private fun retry() {
        if(!active)return
        status("실시간 연결 재시도 중 · 필요하면 동기화를 눌러 주세요.")
        handler.removeCallbacks(reconnect)
        val delay=(1000L shl attempt.coerceAtMost(5))+java.util.Random().nextInt(500)
        attempt++;handler.postDelayed(reconnect,delay)
    }
}
