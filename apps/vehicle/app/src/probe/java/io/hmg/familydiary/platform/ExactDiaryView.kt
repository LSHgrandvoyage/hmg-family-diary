package io.hmg.familydiary.platform

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.webkit.*
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File

/** Trusted, packaged reference DOM. No network pages or general file access enter this bridge. */
@SuppressLint("SetJavaScriptEnabled")
class ExactDiaryView(context: Context, private val command: (JSONObject, (JSONObject) -> Unit) -> Unit,
    private val photo: (String, String) -> File?) : WebView(context) {
    private var closed = false
    private var lastState:JSONObject?=null
    private var pageReady=false
    private var pendingNavigation:String?=null
    var loaded = false; private set
    init {
        settings.javaScriptEnabled=true
        settings.useWideViewPort=true
        settings.loadWithOverviewMode=true
        settings.allowFileAccess=false;settings.allowContentAccess=false
        settings.domStorageEnabled=false;settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.mediaPlaybackRequiresUserGesture=true
        setBackgroundColor(if(VehicleTheme.resolvedDark(context))0xff0b0d12.toInt() else 0xfff4f5f7.toInt())
        addJavascriptInterface(object {
            @JavascriptInterface fun theme():String=VehicleTheme.state(context).toString()
            @JavascriptInterface fun invoke(raw: String) {
                if(raw.length>65536)return
                val request=runCatching { JSONObject(raw) }.getOrNull()?:return
                post { if(!closed)command(request) { result -> post { if(!closed)evaluateJavascript("window.NativeReply?.(${request.optInt("id")},$result)",null) } } }
            }
        }, "NativeDiary")
        webViewClient=object:WebViewClient(){
            override fun onPageFinished(view:WebView,url:String){
                if(closed || !url.startsWith("https://chagok.local/app.html"))return
                pageReady=true
                pendingNavigation?.let{pendingNavigation=null;evaluateJavascript(it,null)}
                lastState?.let { state(it) }
            }
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest):Boolean = request.url.scheme!="https" || request.url.host!="chagok.local" || request.url.path!="/app.html"
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse {
                val uri=request.url
                fun denied()=WebResourceResponse("text/plain","UTF-8",403,"Forbidden",mapOf("Cache-Control" to "no-store"),ByteArrayInputStream(ByteArray(0)))
                if(uri.scheme!="https" || uri.host!="chagok.local" || request.method!="GET")return denied()
                val path=uri.path?.removePrefix("/")?:return denied()
                if(path.split('/').any { it==".." || it=="." })return denied()
                return runCatching {
                    if(path.startsWith("_photos/")){
                        val parts=uri.pathSegments
                        if(parts.size!=3)return denied()
                        val file=photo(parts[1],parts[2])?:return denied()
                        WebResourceResponse("image/jpeg",null,200,"OK",mapOf("Cache-Control" to "no-store"),file.inputStream())
                    }else{
                        val mime=when{path.endsWith(".html")->"text/html";path.endsWith(".js")->"text/javascript";path.endsWith(".css")->"text/css";path.endsWith(".svg")->"image/svg+xml";path.endsWith(".woff2")->"font/woff2";else->return denied()}
                        WebResourceResponse(mime,"UTF-8",context.assets.open(path))
                    }
                }.getOrElse { denied() }
            }
        }
    }
    private fun navigate(script:String){if(closed)return;if(!loaded)start();if(pageReady)evaluateJavascript(script,null)else pendingNavigation=script}
    fun start(){if(!loaded && !closed){loaded=true;loadUrl("https://chagok.local/app.html#carhome")}}
    fun theme(value:JSONObject) {
        setBackgroundColor(if(value.optBoolean("theme_dark"))0xff0b0d12.toInt() else 0xfff4f5f7.toInt())
        if(loaded && !closed)evaluateJavascript("window.DiaryTheme?.native($value)",null)
    }
    fun state(value:JSONObject){
        lastState=value
        theme(value)
        if(!loaded || !pageReady || closed)return
        evaluateJavascript("window.nativeStatus?.($value)",null)
    }
    fun restore(page:String,id:String?)=navigate("window.restoreNativeView?.(${JSONObject.quote(page)},${id?.let{JSONObject.quote(it)}?:"null"})")
    fun recording()=navigate("location.hash='recording'")
    fun memory(id:String)=navigate("window.openNativeMemory?.(${JSONObject.quote(id)})")
    fun captureFailed(message:String){if(loaded && !closed)evaluateJavascript("window.captureFailed?.(${JSONObject.quote(message)})",null)}
    fun review(id:String)=navigate("window.openNativeReview?.(${JSONObject.quote(id)})")
    fun refreshSafe(){if(loaded && !closed)evaluateJavascript("window.refreshNative?.(true)",null)}
    fun settings()=navigate("window.openNativeSettings?.()")
    fun library()=navigate("window.openNativeLibrary?.()")
    fun refresh(){if(loaded && !closed)evaluateJavascript("window.refreshNative?.()",null)}
    fun message(value:String){if(loaded && !closed)evaluateJavascript("window.nativeMessage?.(${JSONObject.quote(value)})",null)}
    fun close(){closed=true;removeJavascriptInterface("NativeDiary");stopLoading();destroy()}
}
