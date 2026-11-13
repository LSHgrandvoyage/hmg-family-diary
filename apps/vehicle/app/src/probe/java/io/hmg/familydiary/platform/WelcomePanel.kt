package io.hmg.familydiary.platform

import android.annotation.SuppressLint
import android.content.Context
import android.view.View
import android.webkit.*
import android.widget.*
import org.json.JSONObject
import org.json.JSONArray
import java.io.ByteArrayInputStream

/** Entry-only local page. No family, filesystem or media commands are exposed. */
@SuppressLint("SetJavaScriptEnabled")
class WelcomePanel(context:Context, private val ui:VehicleTheme, onStart:()->Unit, onLater:()->Unit, onTheme:()->Unit):FrameLayout(context) {
    val acknowledgement=ui.check("함께 탄 가족에게 녹음과 보관을 알렸어요")
    val storageConsent=ui.check("대화 녹음과 가족 보관함 저장에 동의해요")
    val noticeConsent=ui.check("이용·개인정보 처리 안내 확인")
    val accepted get()=checks.all{it.isChecked}
    private val checks get()=listOf(acknowledgement,storageConsent,noticeConsent)
    val start=ui.button("동의하고 시작하기",true,onStart)
    val later=ui.button("나중에",false,onLater)
    val web=WebView(context)
    private var ready=false
    private var waiting=false
    private var loaded=false
    private var closed=false
    private var updating=false
    private var published=""
    @Volatile private var snapshot="{}"
    init {
        tag="first-use";contentDescription="차곡차곡 시작 안내"
        addView(web,LayoutParams(-1,-1))
        web.settings.apply {javaScriptEnabled=true;allowFileAccess=false;allowContentAccess=false;domStorageEnabled=false;mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW}
        web.addJavascriptInterface(object {
            @JavascriptInterface fun state()=snapshot
            @JavascriptInterface fun invoke(raw:String) {
                if(raw.length>1024)return
                val request=runCatching{JSONObject(raw)}.getOrNull()?:return
                post {
                    if(closed || !isShown)return@post
                    when(request.optString("cmd")) {
                        "all"->if(!waiting){updating=true;checks.forEach{it.isChecked=request.optBoolean("checked")};updating=false;publish()}
                        "toggle"->if(!waiting){checks.getOrNull(request.optInt("index",-1))?.isChecked=request.optBoolean("checked")}
                        "start"->if(ready && !waiting && accepted)start.performClick()
                    }
                }
            }
        },"NativeEntry")
        web.webViewClient=object:WebViewClient() {
            override fun onPageFinished(view:WebView,url:String){if(url=="https://entry.chagok.local/welcome.html"&&!closed){loaded=true;published="";publish()}}
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse {
                fun denied()=WebResourceResponse("text/plain","UTF-8",403,"Forbidden",emptyMap(),ByteArrayInputStream(ByteArray(0)))
                val uri=request.url;val path=uri.path?.removePrefix("/")?:return denied()
                if(uri.scheme!="https"||uri.host!="entry.chagok.local"||request.method!="GET"||path.split('/').any{it==".."||it=="."})return denied()
                val allowed=path in setOf("welcome.html","welcome.css","welcome.js","theme.css","theme.js","fonts.css","brand/chagok-logo.svg") || path.startsWith("fonts/")&&path.endsWith(".woff2")
                if(!allowed)return denied()
                return runCatching {
                    val mime=when(path.substringAfterLast('.')){"html"->"text/html";"css"->"text/css";"js"->"text/javascript";"svg"->"image/svg+xml";"woff2"->"font/woff2";else->return denied()}
                    WebResourceResponse(mime,"UTF-8",context.assets.open(path))
                }.getOrElse{denied()}
            }
        }
        checks.forEach{it.setOnCheckedChangeListener{_,_->if(!updating)publish()}}
        publish();web.loadUrl("https://entry.chagok.local/welcome.html")
    }
    fun reset(){updating=true;checks.forEach{it.isChecked=false};updating=false;publish()}
    fun update(serviceReady:Boolean,acceptedButUnknown:Boolean){ready=serviceReady;waiting=acceptedButUnknown;publish()}
    private fun publish(){
        if(closed)return
        start.isEnabled=ready&&!waiting&&accepted
        snapshot=JSONObject().put("checks",JSONArray(checks.map{it.isChecked})).put("ready",ready).put("waiting",waiting).put("theme",VehicleTheme.state(context)).toString()
        web.setBackgroundColor(ui.bg)
        if(loaded&&published!=snapshot){published=snapshot;web.evaluateJavascript("window.updateWelcome?.($snapshot)",null)}
    }
    fun close(){closed=true;web.removeJavascriptInterface("NativeEntry");web.stopLoading();web.destroy()}
}
