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
    private var state = if (stateFile.baseFile.exists()) JSONObject(stateFile.openRead().bufferedReader().use { it.readText() }) else JSONObject().put("links", JSONObject()).put("cursor", "0")
    @Volatile private var cancelled = false
    @Volatile private var connection: HttpsURLConnection? = null
    val paired: Boolean get() = state.optString("token").isNotBlank()
    fun linked(file: String) = state.getJSONObject("links").keys().asSequence().any { state.getJSONObject("links").getJSONObject(it).getString("file") == file }
    fun configured() = File(root,"sync-origin.txt").isFile && File(root,"sync-ca.crt").isFile
    private fun save() { val stream=stateFile.startWrite();try {stream.write(state.toString().toByteArray());stateFile.finishWrite(stream)}catch(e:Exception){stateFile.failWrite(stream);throw e} }
    fun cancel() { cancelled=true;connection?.disconnect() }
    fun begin() {cancelled=false}
    private fun checkActive(){check(!cancelled){"동기화가 중단됐어요. 주차 후 다시 시도해 주세요."}}
    private fun hash(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
    private fun request(path:String, method:String="GET", data:ByteArray?=null, key:String?=null, claim:Boolean=false):ByteArray {
        checkActive();check(configured()){"개발 서버 연결 설정이 필요해요."}
        val origin=File(root,"sync-origin.txt").readText().trim();val url=java.net.URI(origin)
        require(url.scheme=="https" && url.rawPath.isNullOrEmpty() && url.rawQuery==null && url.rawUserInfo==null)
        val cert=File(root,"sync-ca.crt").inputStream().use{CertificateFactory.getInstance("X.509").generateCertificate(it)}
        val ks=KeyStore.getInstance(KeyStore.getDefaultType()).apply{load(null);setCertificateEntry("local-development",cert)}
        val trust=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply{init(ks)}
        val tls=SSLContext.getInstance("TLS").apply{init(null,trust.trustManagers,null)}
        val conn=java.net.URI("$origin/api/v1/$path").toURL().openConnection() as HttpsURLConnection;connection=conn
        try {
            conn.sslSocketFactory=tls.socketFactory // Keep platform hostname verification; never trust all certificates.
            conn.connectTimeout=10000;conn.readTimeout=30000;conn.requestMethod=method;conn.instanceFollowRedirects=false
            if(!claim)conn.setRequestProperty("Authorization","Bearer ${state.getString("token")}")
            conn.setRequestProperty("Origin",origin)
            if(key!=null)conn.setRequestProperty("Idempotency-Key",key)
            if(data!=null){conn.doOutput=true;conn.setRequestProperty("Content-Type",if(path.endsWith("/audio"))"audio/wav" else "application/json");conn.setFixedLengthStreamingMode(data.size);conn.outputStream.use{it.write(data)}}
            val status=conn.responseCode
            if(status==401 && !claim){purgeShared();throw IllegalStateException("차량 연결이 해제되거나 만료됐어요. 공유 사본을 지웠고, 아직 공유하지 않은 기록은 남겨 두었어요.")}
            if(status==410)throw Gone()
            check(status in 200..299){when(status){409->"다른 기기의 변경이 있어요. 동기화 후 다시 시도해 주세요.";422->"기록이나 연결 코드를 확인해 주세요.";429->"요청이 많아요. 잠시 후 다시 시도해 주세요.";else->"서버에 연결하지 못했어요. 기록은 유지돼요. ($status)"}}
            return conn.inputStream.use{stream->val out=java.io.ByteArrayOutputStream();val buf=ByteArray(8192);while(true){checkActive();val n=stream.read(buf);if(n<0)break;require(out.size()+n<=42*1024*1024);out.write(buf,0,n)};out.toByteArray()}
        } finally {conn.disconnect();connection=null}
    }
    private fun json(path:String,method:String="GET",value:JSONObject?=null,key:String?=null,claim:Boolean=false)=JSONObject(String(request(path,method,value?.toString()?.toByteArray(),key,claim),Charsets.UTF_8))
    fun pair(code:String) {
        check(!paired){"이미 연결된 차량이에요."}
        val result=json("devices/claim","POST",JSONObject().put("code",code).put("label","차량 미리 보기"),claim=true)
        state=JSONObject().put("token",result.getString("token")).put("vault",result.getString("vault_id")).put("device",result.getString("id")).put("cursor","0").put("links",JSONObject());save()
    }
    private fun removeLocal(link:JSONObject){val name=link.getString("file");check(File(recordings,name).delete() || !File(recordings,name).exists());reviews.delete(name);check(contexts.delete(name))}
    private fun purgeShared(){val links=state.getJSONObject("links");for(id in links.keys().asSequence().toList()){removeLocal(links.getJSONObject(id));links.remove(id);save()};state=JSONObject().put("links",JSONObject()).put("cursor","0");save()}
    private fun idFor(file:File):String = state.getJSONObject("links").keys().asSequence().firstOrNull{state.getJSONObject("links").getJSONObject(it).getString("file")==file.name} ?: UUID.nameUUIDFromBytes((state.getString("vault")+":"+file.name).toByteArray()).toString()
    fun share(file:File){
        check(paired){"휴대폰에서 만든 연결 코드를 먼저 입력해 주세요."}
        val r=reviews.load(file);check(r.accepted==r.revision&&r.confirmed==r.revision&&r.draftRevision==r.revision&&r.generationMode=="mock"){"내용 확인에서 목업 일기를 저장한 뒤 공유해 주세요."}
        val id=idFor(file); val links=state.getJSONObject("links")
        var expected=links.optJSONObject(id)?.optInt("revision",0)?:0
        val snapshot=JSONObject(File(root,"capture-review/${file.name}.json").readText()).put("context",contexts.load(file.name)?.json()?:JSONObject.NULL)
        // Persist intent before network I/O, so a lost response can be retried without losing ownership of the shared copy.
        val link=links.optJSONObject(id)?:JSONObject().put("file",file.name).put("revision",0).put("input_revision",r.revision).put("photos",JSONArray())
        links.put(id,link);save()
        val pending=link.optJSONObject("pending")
        val payload=JSONObject().put("expected_revision",expected).put("snapshot",snapshot)
        val key=if(pending!=null&&pending.getString("hash")==hash(payload.toString().toByteArray()))pending.getString("key") else UUID.randomUUID().toString()
        link.put("pending",JSONObject().put("hash",hash(payload.toString().toByteArray())).put("key",key));save()
        try {
            val saved=json("sessions/$id/snapshot","PUT",payload,key)
            link.put("revision",saved.getInt("revision")).put("input_revision",r.revision).remove("pending");save()
            val uploaded=JSONObject(String(request("sessions/$id/audio","PUT",file.readBytes()),Charsets.UTF_8))
            link.put("revision",uploaded.getInt("revision"));save();pull()
        } catch(e:Gone){removeLocal(link);links.remove(id);save();throw IllegalStateException("다른 기기에서 삭제한 기록이에요. 이 기기의 공유 사본도 삭제했어요.")}
    }
    fun pull(){
        check(paired){"차량 연결 코드를 먼저 입력해 주세요."}
        json("me") // Verify revocation even when there are no changes.
        var more:Boolean
        do {
            val response=json("sync?cursor=${state.getString("cursor")}"); val items=response.getJSONArray("items")
            for(i in 0 until items.length()){checkActive();apply(items.getJSONObject(i))}
            state.put("cursor",response.getString("cursor"));save();more=response.getBoolean("has_more")
        }while(more)
    }
    private fun apply(m:JSONObject){
        val id=m.getString("id");UUID.fromString(id);val links=state.getJSONObject("links");var link=links.optJSONObject(id)
        if(m.getBoolean("deleted")){if(link!=null){removeLocal(link);links.remove(id);save()};return}
        if(!m.getBoolean("audio_ready"))return // A later ready change will be emitted after complete immutable upload.
        val s=m.getJSONObject("snapshot"); val name=link?.getString("file")?:"$id.wav"; val target=File(recordings,name)
        // Track newly fetched objects before writing any media, so cancellation/revocation can clean them up.
        if(link==null){link=JSONObject().put("file",name).put("revision",0).put("input_revision",s.getInt("revision")).put("photos",JSONArray());links.put(id,link);save()}
        if(!target.exists()){
            val data=request("sessions/$id/audio");require(hash(data)==s.getString("sha256"));val atomic=AtomicFile(target);recordings.mkdirs();val stream=atomic.startWrite();try{stream.write(data);atomic.finishWrite(stream)}catch(e:Exception){atomic.failWrite(stream);throw e}
        }
        require(PcmWave.sha256(target)==s.getString("sha256"))
        val local=reviews.load(target)
        if(local.revision==link.getInt("input_revision") || local.text.isBlank()){
            val raw=s.getJSONArray("raw_history")
            reviews.save(ReviewRecord(name,s.getString("sha256"),s.getLong("duration_ms"),s.getString("recorded_at"),(0 until raw.length()).map{raw.getString(it)},s.getString("text"),s.getString("speaker"),s.getInt("revision"),s.getInt("confirmed"),s.getString("draft"),s.getInt("draft_revision"),s.getInt("accepted"),s.getString("model"),s.getString("prompt_version"),s.getString("generation_mode")))
            link.put("input_revision",s.getInt("revision"))
        }
        if(!s.isNull("context")&&contexts.load(name)==null){val ctx=s.getJSONObject("context");contexts.create(name,MemoryContext(ctx.getString("started_at"),VehicleSnapshot.read(ctx.getJSONObject("vehicle")),ctx.getJSONObject("location").getString("status")=="synthetic"))}
        val photos=m.getJSONArray("photos"); val ids=mutableSetOf<String>()
        for(i in 0 until photos.length()){val p=photos.getJSONObject(i); val photoId=p.getString("id");UUID.fromString(photoId);ids.add(photoId)
            val photo=File(root,"memory-context/$name/$photoId.jpg")
            if(!photo.exists()||hash(photo.readBytes())!=p.getString("sha256")){val data=request("sessions/$id/photos/$photoId");require(hash(data)==p.getString("sha256"));photo.parentFile!!.mkdirs();val atomic=AtomicFile(photo);val stream=atomic.startWrite();try{stream.write(data);atomic.finishWrite(stream)}catch(e:Exception){atomic.failWrite(stream);throw e}}
        }
        val previous=link.getJSONArray("photos");for(i in 0 until previous.length()){val photoId=previous.getString(i);if(photoId !in ids)File(root,"memory-context/$name/$photoId.jpg").delete()}
        link.put("photos",JSONArray(ids.toList())).put("revision",m.getInt("revision"));save()
    }
    fun delete(file:File){val id=idFor(file);val link=state.getJSONObject("links").getJSONObject(id)
        try{json("sessions/$id","DELETE",JSONObject().put("expected_revision",link.getInt("revision")))}catch(_:Gone){}
        removeLocal(link);state.getJSONObject("links").remove(id);save()
    }
    fun deletePhoto(file:File,photo:File){val id=idFor(file);json("sessions/$id/photos/${photo.nameWithoutExtension}","DELETE");pull()}
    private class Gone:Exception()
}
