package io.hmg.familydiary.platform

import android.util.AtomicFile
import io.hmg.familydiary.capture.PcmWave
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.util.UUID
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory

/** Debug/emulator connected slice. Credentials and the specific local CA remain app-private. */
class CloudSync(private val root: File, private val recordings: File, private val reviews: ReviewStore, private val contexts: MemoryContextStore) {
    private val stateFile = AtomicFile(File(root, "cloud-sync.json"))
    @Volatile private var state = if (stateFile.baseFile.exists() || File(stateFile.baseFile.path+".bak").exists()) JSONObject(stateFile.openRead().bufferedReader().use { it.readText() }) else JSONObject().put("links", JSONObject()).put("cursor", "0")
    @Volatile private var visible = JSONObject(state.toString())
    val outbox = SyncOutbox(root)
    @Volatile var uploading = false
        private set
    @Volatile var version = 0L
        private set
    private val contentChanges=java.util.concurrent.atomic.AtomicLong(0)
    val changeSequence:Long get()=contentChanges.get()
    private fun contentChanged(){contentChanges.incrementAndGet();version++}
    val vault: String get() = visible.optString("vault")
    val device: String get() = visible.optString("device")
    val revoked: Boolean get() = visible.optBoolean("auth_invalid")
    @Volatile private var cancelled = false
    @Volatile private var connection: HttpsURLConnection? = null
    val paired: Boolean get() = visible.optString("token").isNotBlank() && !revoked
    val lastVerifiedAt: String get() = visible.optString("last_verified_at")
    val lastSyncedAt: String get() = visible.optString("last_synced_at")
    val deviceLabel: String get() = visible.optString("pending_label").ifBlank { visible.optString("label") }
    val nameUnified: Boolean get() = visible.optBoolean("name_unified")
    val namePending: Boolean get() = visible.optString("pending_label").isNotBlank()
    private val forceNameRetry=java.util.concurrent.atomic.AtomicBoolean(false)
    private fun visibleLinks() = visible.getJSONObject("links").let { j -> j.keys().asSequence().map { j.getJSONObject(it) }.toList() }
    val sharedCount: Int get() = visibleLinks().count { it.optBoolean("audio_ready") && !outbox.deleted(it.getString("file")) }
    fun linked(file: String) = visibleLinks().any { it.getString("file")==file }
    fun uploaded(file: String) = visibleLinks().any { it.getString("file")==file && it.optBoolean("audio_ready") }
    fun shareStatus(file: String, revision: Int): String {
        if(outbox.owner(file).let { it.isNotBlank() && it!=vault }) return "other_vault"
        if(!paired) return "local"
        val job=outbox.jobs(vault,device).firstOrNull { it.getString("file")==file }
        if(job!=null) return if(job.optBoolean("blocked")) "conflict" else if(uploading) "syncing" else "pending"
        val link=visibleLinks().firstOrNull { it.getString("file")==file }
        return if(link?.optBoolean("audio_ready")==true && link.optInt("input_revision",-1)==revision) "shared" else "pending"
    }
    val uploadNotice: String get() = if(revoked) "차량 연결을 다시 해 주세요." else if(namePending) "차 별명 반영 대기 · 연결되면 같은 이름으로 표시돼요." else outbox.jobs(vault,device).firstOrNull { it.has("error") }?.optString("error").orEmpty()
    fun retryDelay(): Long? {
        if(!paired)return null
        val names=if(namePending) listOf((visible.optLong("name_next_at")-System.currentTimeMillis()).coerceAtLeast(0)) else emptyList()
        return (names+outbox.jobs(vault,device).filter { !it.optBoolean("blocked") }.map { (it.optLong("next_at")-System.currentTimeMillis()).coerceAtLeast(0) }).minOrNull()
    }
    fun configured() = ServerSettings.configured(root)
    private fun save() { val stream=stateFile.startWrite();try {stream.write(state.toString().toByteArray());stateFile.finishWrite(stream);visible=JSONObject(state.toString());version++}catch(e:Exception){stateFile.failWrite(stream);throw e} }
    fun cancel() { cancelled=true;connection?.disconnect() }
    fun begin() {cancelled=false}
    private fun checkActive(){check(!cancelled){"동기화가 중단됐어요. 주차 후 다시 시도해 주세요."}}
    private fun hash(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    fun eventConnection(): HttpsURLConnection = openConnection("events").apply {
        connectTimeout=10000;readTimeout=45000;instanceFollowRedirects=false
        setRequestProperty("Authorization","Bearer ${state.getString("token")}")
        setRequestProperty("Accept","text/event-stream")
    }
    private fun openConnection(path:String):HttpsURLConnection {
        val settings=ServerSettings.read(root);val origin=settings.origin;val url=java.net.URI(origin)
        require(url.scheme=="https" && url.rawPath.isNullOrEmpty() && url.rawQuery==null && url.rawUserInfo==null)
        val cert=settings.certificate
        val ks=KeyStore.getInstance(KeyStore.getDefaultType()).apply{load(null);setCertificateEntry("local-development",cert)}
        val trust=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply{init(ks)}
        val tls=SSLContext.getInstance("TLS").apply{init(null,trust.trustManagers,null)}
        val conn=java.net.URI("$origin/api/v1/$path").toURL().openConnection() as HttpsURLConnection
        conn.sslSocketFactory=tls.socketFactory
        return conn
    }
    private fun request(path:String, method:String="GET", data:ByteArray?=null, key:String?=null, claim:Boolean=false):ByteArray {
        checkActive();check(configured()){"서버 주소가 아직 등록되지 않았어요. 설정의 연결 서버 설정에서 PC 서버를 먼저 등록해 주세요."}
        val origin=ServerSettings.read(root).origin
        val conn=openConnection(path);connection=conn
        try {
            conn.connectTimeout=10000;conn.readTimeout=30000;conn.requestMethod=method;conn.instanceFollowRedirects=false
            if(!claim)conn.setRequestProperty("Authorization","Bearer ${state.getString("token")}")
            conn.setRequestProperty("Origin",origin)
            if(key!=null)conn.setRequestProperty("Idempotency-Key",key)
            if(data!=null){conn.doOutput=true;conn.setRequestProperty("Content-Type",if(path.endsWith("/audio"))"audio/wav" else "application/json");conn.setFixedLengthStreamingMode(data.size);conn.outputStream.use{it.write(data)}}
            val status=conn.responseCode
            if(status==401 && !claim){bindLocal();state.put("auth_invalid",true);save();throw IllegalStateException("차량 연결이 해제되거나 만료됐어요. 다시 연결해 주세요.")}
            if(status==409)throw Conflict()
            if(status==404)throw Missing()
            if(status==422 || status==403) {
                val code=runCatching { conn.errorStream?.bufferedReader()?.use { JSONObject(it.readText()).optJSONObject("error")?.optString("code") } }.getOrNull()
                throw Invalid(code?.takeIf { it in setOf("AUDIO_MISMATCH","INVALID_WAV","VEHICLE_REQUIRED","INVALID_SNAPSHOT") } ?: "INVALID_RECORD")
            }
            if(status==410)throw Gone()
            check(status in 200..299){when(status){409->"다른 기기의 변경이 있어요. 동기화 후 다시 시도해 주세요.";422->"기록이나 연결 코드를 확인해 주세요.";429->"요청이 많아요. 잠시 후 다시 시도해 주세요.";else->"서버에 연결하지 못했어요. 기록은 유지돼요. ($status)"}}
            return conn.inputStream.use{stream->val out=java.io.ByteArrayOutputStream();val buf=ByteArray(8192);while(true){checkActive();val n=stream.read(buf);if(n<0)break;require(out.size()+n<=42*1024*1024);out.write(buf,0,n)};out.toByteArray()}
        } finally {conn.disconnect();connection=null}
    }
    private fun json(path:String,method:String="GET",value:JSONObject?=null,key:String?=null,claim:Boolean=false)=JSONObject(String(request(path,method,value?.toString()?.toByteArray(),key,claim),Charsets.UTF_8))
    @Synchronized fun pair(code:String, label:String = "차량 미리 보기") {
        check(!paired){"이미 연결된 차량이에요."}
        require(label.trim().length in 1..40){"차 별명을 1~40자로 입력해 주세요."}
        if(revoked)purgeShared()
        val result=json("devices/claim","POST",JSONObject().put("code",code).put("label",label.trim()),claim=true)
        state=JSONObject().put("name_unified",true).put("label",label.trim()).put("token",result.getString("token")).put("vault",result.getString("vault_id")).put("device",result.getString("id")).put("expires_at",result.getString("expires_at")).put("last_verified_at",java.time.Instant.now().toString()).put("cursor","0").put("links",JSONObject());save();bindLocal();outbox.rebind(vault,device);reconcile()
    }
    @Synchronized fun rename(label:String) {
        require(label.trim().length in 1..40){"차 별명을 1~40자로 입력해 주세요."}
        val response=json("devices/${state.getString("device")}","PATCH",JSONObject().put("label",label.trim()))
        state.put("label",response.getString("label")).put("name_unified",true).remove("pending_label");save()
    }
    /** Short durable name transaction; callers use their worker, never the UI thread. */
    @Synchronized fun queueVehicleName(value:String) {
        val name=value.trim();require(name.length in 1..40){"차 별명을 1~40자로 입력해 주세요."};check(paired)
        state.put("name_unified",true)
        if(name==state.optString("label"))state.remove("pending_label") else state.put("pending_label",name)
        state.put("name_next_at",0).put("name_attempts",0);save()
    }
    @Synchronized fun adoptVehicleName(value:String) {if(paired && !nameUnified)queueVehicleName(value)}
    private fun flushVehicleName() {
        if(!namePending)return
        if(!forceNameRetry.getAndSet(false) && state.optLong("name_next_at")>System.currentTimeMillis())return
        try {
            val response=json("devices/${state.getString("device")}","PATCH",JSONObject().put("label",state.getString("pending_label")))
            state.put("label",response.getString("label")).remove("pending_label");state.remove("name_next_at");state.remove("name_attempts");save()
        } catch(e:Exception) {
            val attempt=(state.optInt("name_attempts")+1).coerceAtMost(5)
            state.put("name_attempts",attempt).put("name_next_at",System.currentTimeMillis()+(30000L shl (attempt-1)).coerceAtMost(300000L));save()
        }
    }
    private fun removeLocal(link:JSONObject){val name=link.getString("file");check(File(recordings,name).delete() || !File(recordings,name).exists());reviews.delete(name);check(contexts.delete(name))}
    private fun purgeShared(){bindLocal();val links=state.getJSONObject("links");for(id in links.keys().asSequence().toList()){val link=links.getJSONObject(id);if(link.optBoolean("audio_ready") && outbox.jobs(vault,device).none { it.getString("file")==link.getString("file") })removeLocal(link);links.remove(id);save()};state=JSONObject().put("links",JSONObject()).put("cursor","0");save()}
    @Synchronized fun cleanupRevoked(){if(revoked)purgeShared()}
    private fun bindLocal(){if(vault.isNotBlank())recordings.listFiles()?.filter { it.extension=="wav" }?.forEach { outbox.bind(it.name,vault) }}
    private fun idFor(file:File):String = state.getJSONObject("links").keys().asSequence().firstOrNull{state.getJSONObject("links").getJSONObject(it).getString("file")==file.name} ?: outbox.jobs(vault,device).firstOrNull { it.getString("file")==file.name }?.getString("id") ?: UUID.nameUUIDFromBytes((state.getString("vault")+":"+file.name).toByteArray()).toString()
    /** Called immediately after final save; only short local disk transactions, even while a job uploads. */
    fun capture(file: File) {
        if(!paired || !file.isFile || !outbox.bind(file.name,vault) || outbox.deleted(file.name))return
        val r=reviews.load(file)
        if(r.accepted!=r.revision || r.confirmed!=r.revision || r.draftRevision!=r.revision || r.draft==null || r.generationMode!="mock")return
        val link=visibleLinks().firstOrNull { it.getString("file")==file.name }
        if(link?.optBoolean("audio_ready")==true && link.optInt("input_revision",-1)==r.revision)return
        val snapshot=reviews.snapshot(r).put("context",contexts.load(file.name)?.json()?:JSONObject.NULL)
        val id=visible.getJSONObject("links").let { links -> links.keys().asSequence().firstOrNull { links.getJSONObject(it).getString("file")==file.name } }
            ?: outbox.jobs(vault,device).firstOrNull { it.getString("file")==file.name }?.getString("id")
            ?: UUID.nameUUIDFromBytes((vault+":"+file.name).toByteArray()).toString()
        outbox.enqueue(file.name,vault,device,id,snapshot,link);version++
    }
    fun retryNow(){forceNameRetry.set(true);outbox.retryAudioValidation(vault,device,false);outbox.jobs(vault,device).filter { !it.optBoolean("blocked") }.forEach { it.put("next_at",0);outbox.update(it) }}
    fun reconcile(){if(paired)recordings.listFiles()?.filter { it.extension=="wav" }?.forEach { capture(it) }}
    @Synchronized fun share(file:File){capture(file);flush();pull()} // Legacy test adapter; UI never needs this.
    /** Uploads only. No local audio/photo/review replacement or deletion in background. */
    @Synchronized fun flush(): Boolean {
        if(!paired)return false
        begin()
        if(outbox.retryAudioValidation(vault,device,true)){state.put("cursor","0");save()}
        reconcile();uploading=true;version++
        try {
            flushVehicleName()
            for(job in outbox.jobs(vault,device)) {
                if(!paired || cancelled)break
                if(job.optBoolean("blocked") || job.optLong("next_at")>System.currentTimeMillis())continue
                try {
                    if(job.optBoolean("delete"))sendDelete(job) else sendUpload(job)
                    outbox.finish(job)
                } catch(e: Gone) {
                    val name=job.getString("file")
                    outbox.delete(name,vault,device,job.getString("id"))
                    outbox.jobs(vault,device).filter { it.getString("file")==name }.forEach { outbox.finish(it) }
                } catch(e: Exception) {
                    val attempts=job.optInt("attempts")+1
                    job.put("attempts",attempts).put("next_at",System.currentTimeMillis()+(30000L shl attempts.coerceAtMost(7)).coerceAtMost(3600000))
                    val blocked=(e is Conflict && !job.optBoolean("delete")) || e is Invalid || e is Missing
                    if(e is Invalid)job.put("error_code",e.code)
                    job.put("blocked",blocked).put("error", when {
                        e is Invalid && e.code=="AUDIO_MISMATCH" -> "원본 길이 또는 무결성 확인에 실패했어요. 서버 업데이트 후 지금 동기화를 눌러 주세요."
                        e is Invalid && e.code=="INVALID_WAV" -> "녹음 파일 형식을 확인하지 못했어요. 차량의 원본은 보관돼 있어요."
                        e is UpgradeRequired -> "서버 업데이트 대기 · 원문 구간과 일기를 이 기기에 보관했어요."
                        e is Conflict -> "내용 충돌 · 이 기기의 일기를 보존했어요. 확인 후 다시 시도해 주세요."
                        blocked -> "기록을 전송하지 못했어요. 내용을 확인해 주세요."
                        !paired -> "차량 연결을 다시 해 주세요."
                        else -> "연결 대기 · 기록을 보관했어요. 연결되면 다시 보내요."
                    });outbox.update(job)
                    if(!paired || cancelled)break
                }
            }
        } finally {uploading=false;version++}
        return retryDelay()!=null
    }
    private fun sendUpload(job: JSONObject) {
        val name=job.getString("file");if(outbox.deleted(name))return
        val id=job.getString("id");val snapshot=job.getJSONObject("snapshot")
        if(snapshot.has("speech_timeline") && json("me").optInt("speech_timeline_version",0)<1)throw UpgradeRequired()
        val links=state.getJSONObject("links")
        val link=links.optJSONObject(id) ?: (job.optJSONObject("base") ?: JSONObject().put("file",name).put("revision",0).put("input_revision",-1).put("photos",JSONArray())).also { links.put(id,it);save() }
        if(link.optBoolean("content_conflict"))throw Conflict()
        val changed = !link.optBoolean("audio_ready") || link.optJSONObject("snapshot")?.let { !sameSnapshot(it,snapshot) } != false
        if(job.getString("stage")=="snapshot") {
            var payload=job.optJSONObject("payload") ?: JSONObject().put("expected_revision",link.optInt("revision")).put("snapshot",snapshot).also { job.put("payload",it);outbox.update(job) }
            var saved:JSONObject
            try { saved=json("sessions/$id/snapshot","PUT",payload,job.getString("request_key")) }
            catch(e:Conflict) {
                val remote=json("sessions/$id")
                val previous=link.optJSONObject("snapshot")
                // Server normalization may reorder draft JSON; compare structurally, never only revision.
                if(!sameSnapshot(remote.getJSONObject("snapshot"),snapshot) && (previous==null || !sameSnapshot(remote.getJSONObject("snapshot"),previous)))throw e
                payload=JSONObject().put("expected_revision",remote.getInt("revision")).put("snapshot",snapshot)
                job.put("payload",payload).put("request_key",UUID.randomUUID().toString());outbox.update(job)
                saved=json("sessions/$id/snapshot","PUT",payload,job.getString("request_key"))
            }
            link.put("revision",saved.getInt("revision"));save()
            job.put("stage","audio");outbox.update(job)
        }
        if(outbox.deleted(name))return
        val file=File(recordings,name);require(PcmWave.sha256(file)==snapshot.getString("sha256"))
        val uploaded=JSONObject(String(request("sessions/$id/audio","PUT",file.readBytes()),Charsets.UTF_8))
        link.put("revision",uploaded.getInt("revision")).put("input_revision",snapshot.getInt("revision"))
            .put("audio_ready",true).put("snapshot",snapshot).remove("pending");save()
        if(changed)contentChanged()
    }
    private fun sendDelete(job:JSONObject) {
        val id=job.getString("id")
        try {
            val latest=json("sessions/$id")
            json("sessions/$id","DELETE",JSONObject().put("expected_revision",latest.getInt("revision")));contentChanged()
        }catch(_:Gone){}catch(_:Missing){}
    }
    private fun sameSnapshot(a:JSONObject,b:JSONObject):Boolean {
        fun canonical(x:Any?):String = when(x) {
            is JSONObject -> x.keys().asSequence().toList().sorted().joinToString(prefix="{",postfix="}") { JSONObject.quote(it)+":"+canonical(x.get(it)) }
            is JSONArray -> (0 until x.length()).joinToString(prefix="[",postfix="]") { canonical(x.get(it)) }
            is String -> JSONObject.quote(x)
            else -> x?.toString() ?: "null"
        }
        fun normalized(s:JSONObject)=JSONObject(s.toString()).apply { put("draft",JSONObject(getString("draft"))) }
        return canonical(normalized(a))==canonical(normalized(b))
    }
    @Synchronized fun pull():Boolean {
        if(revoked){purgeShared();return true}
        state.getJSONObject("links").let { links -> links.keys().asSequence().toList().forEach { id ->
            val link=links.getJSONObject(id);if(outbox.deleted(link.getString("file")))removeLocal(link)
        } }
        var changed=false
        check(paired){"차량 연결 코드를 먼저 입력해 주세요."}
        val me=try{json("me")}catch(e:Exception){if(revoked)purgeShared();throw e} // Foreground gate permits cleanup.
        if (!me.isNull("device_label")) state.put("label",me.getString("device_label"))
        state.put("last_verified_at",java.time.Instant.now().toString());save()
        var more:Boolean
        do {
            val response=json("sync?cursor=${state.getString("cursor")}"); val items=response.getJSONArray("items")
            for(i in 0 until items.length()){checkActive();apply(items.getJSONObject(i));changed=true}
            state.put("cursor",response.getString("cursor"));save();more=response.getBoolean("has_more")
        }while(more)
        state.put("last_synced_at",java.time.Instant.now().toString());save();return changed
    }
    private fun apply(m:JSONObject){
        val id=m.getString("id");UUID.fromString(id);val links=state.getJSONObject("links");var link=links.optJSONObject(id)
        if(m.getBoolean("deleted")){if(link!=null){val name=link.getString("file");val existed=File(recordings,name).exists();outbox.delete(name,vault,device,id);outbox.jobs(vault,device).filter{it.getString("file")==name}.forEach{outbox.finish(it)};removeLocal(link);links.remove(id);save();if(existed)contentChanged()};return}
        if(link!=null && outbox.deleted(link.getString("file")))return
        val audioReady=m.getBoolean("audio_ready")
        val s=m.getJSONObject("snapshot"); val name=link?.getString("file")?:"$id.wav"; val target=File(recordings,name)
        // A locally owned, verified original can receive photos while its upload is pending.
        if(!audioReady && (link==null || !target.isFile || PcmWave.sha256(target)!=s.getString("sha256")))return
        // Track newly fetched objects before writing any media, so cancellation/revocation can clean them up.
        if(link==null){link=JSONObject().put("file",name).put("revision",0).put("input_revision",s.getInt("revision")).put("photos",JSONArray());links.put(id,link);save()}
        var changed=false
        if(!target.exists()){
            val data=request("sessions/$id/audio");require(hash(data)==s.getString("sha256"));val atomic=AtomicFile(target);recordings.mkdirs();val stream=atomic.startWrite();try{stream.write(data);atomic.finishWrite(stream);changed=true}catch(e:Exception){atomic.failWrite(stream);throw e}
        }
        require(PcmWave.sha256(target)==s.getString("sha256"))
        outbox.bind(name,vault)
        val local=reviews.load(target)
        val pending=outbox.jobs(vault,device).filter { it.getString("file")==name }
        val canReplace=audioReady && (local.revision==link.getInt("input_revision") || local.text.isBlank()) && pending.isEmpty()
        if(!canReplace && link.optJSONObject("snapshot")?.let { !sameSnapshot(it,s) }==true && pending.none { it.optJSONObject("snapshot")?.let { candidate -> sameSnapshot(candidate,s) }==true })link.put("content_conflict",true)
        if(canReplace){
            val raw=s.getJSONArray("raw_history")
            val updated=ReviewRecord(name,s.getString("sha256"),s.getLong("duration_ms"),s.getString("recorded_at"),(0 until raw.length()).map{raw.getString(it)},s.getString("text"),s.getString("speaker"),s.getInt("revision"),s.getInt("confirmed"),s.getString("draft"),s.getInt("draft_revision"),s.getInt("accepted"),s.getString("model"),s.getString("prompt_version"),s.getString("generation_mode"),s.optJSONObject("speech_timeline")?.toString())
            if(local.draft==null || !sameSnapshot(reviews.snapshot(local),reviews.snapshot(updated))){reviews.save(updated);changed=true}
            link.put("input_revision",s.getInt("revision"))
        }
        if(!s.isNull("context")&&contexts.load(name)==null){val ctx=s.getJSONObject("context");contexts.create(name,MemoryContext.read(ctx));changed=true}
        val photos=m.getJSONArray("photos"); val ids=mutableSetOf<String>()
        for(i in 0 until photos.length()){val p=photos.getJSONObject(i); val photoId=p.getString("id");UUID.fromString(photoId);ids.add(photoId)
            val photo=File(root,"memory-context/$name/$photoId.jpg")
            if(!photo.exists()||hash(photo.readBytes())!=p.getString("sha256")){val data=request("sessions/$id/photos/$photoId");require(hash(data)==p.getString("sha256"));photo.parentFile!!.mkdirs();val atomic=AtomicFile(photo);val stream=atomic.startWrite();try{stream.write(data);atomic.finishWrite(stream);changed=true}catch(e:Exception){atomic.failWrite(stream);throw e}}
        }
        val previous=link.getJSONArray("photos");for(i in 0 until previous.length()){val photoId=previous.getString(i);if(photoId !in ids)File(root,"memory-context/$name/$photoId.jpg").delete()}
        if((0 until previous.length()).map { previous.getString(it) }!=ids.toList())changed=true
        contexts.setPhotoOrder(name,ids.map { "$it.jpg" })
        link.put("photos",JSONArray(ids.toList())).put("audio_ready",audioReady)
        if(!link.optBoolean("content_conflict"))link.put("revision",m.getInt("revision"))
        if(canReplace)link.put("snapshot",s)
        save();if(changed)contentChanged()
    }
    @Synchronized fun delete(file:File){
        val id=if(vault.isNotBlank())idFor(file) else ""
        outbox.delete(file.name,vault,device,id) // Durable before touching local media or the network.
        state.getJSONObject("links").optJSONObject(id)?.apply { remove("snapshot");remove("pending") };save()
        removeLocal(JSONObject().put("file",file.name));version++
    }
    @Synchronized fun deletePhoto(file:File,photo:File){val id=idFor(file);json("sessions/$id/photos/${photo.nameWithoutExtension}","DELETE");pull()}
    private class Gone:Exception()
    private class Missing:Exception()
    private class UpgradeRequired:Exception()
    private class Conflict:Exception()
    private class Invalid(val code:String):Exception()
    companion object {
        private val instances=java.util.concurrent.ConcurrentHashMap<String,CloudSync>()
        fun get(root:File):CloudSync=instances.computeIfAbsent(root.canonicalPath) {
            CloudSync(root,File(root,"capture-probe"),ReviewStore(File(root,"capture-review")),MemoryContextStore(File(root,"memory-context")))
        }
    }
}
