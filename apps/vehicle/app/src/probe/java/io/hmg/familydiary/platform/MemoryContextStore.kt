package io.hmg.familydiary.platform

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.AtomicFile
import org.json.JSONObject
import org.json.JSONArray
import java.io.File
import java.io.InputStream
import java.util.UUID

/** Immutable recording-time vehicle and private location snapshot. */
data class VehicleSnapshot(val nickname: String = "", val brand: String = "", val model: String = "",
    val type: String = "", val year: String = "", val plate: String = "", val source: String = "manual") {
    fun json() = JSONObject().put("nickname", nickname).put("brand", brand).put("model", model)
        .put("type", type).put("year", year).put("plate", plate).put("source", source)
    fun label() = listOf(nickname, brand, model).filter { it.isNotBlank() }.joinToString(" · ").ifBlank { "차량 정보 없음" }
    companion object {
        fun read(j: JSONObject) = VehicleSnapshot(j.optString("nickname"), j.optString("brand"), j.optString("model"),
            j.optString("type"), j.optString("year"), j.optString("plate"), j.optString("source", "manual"))
    }
}
data class MemoryContext(val startedAt: String, val vehicle: VehicleSnapshot, val mockLocation: Boolean = false,
    val location:RecordedLocation=if(mockLocation)RecordedLocation("synthetic",startedAt) else RecordedLocation()) {
    fun json() = JSONObject().put("started_at", startedAt).put("vehicle", vehicle.json())
        .put("location", location.json())
    companion object {
        fun read(j:JSONObject)=MemoryContext(j.getString("started_at"),VehicleSnapshot.read(j.getJSONObject("vehicle")),
            j.getJSONObject("location").getString("status")=="synthetic",RecordedLocation.read(j.getJSONObject("location")))
    }
}
class MemoryContextStore(private val directory: File) {
    private fun folder(id: String): File {
        require(Regex("[A-Za-z0-9.-]+\\.wav").matches(id))
        return File(directory, id).apply { mkdirs() }
    }
    fun load(id: String): MemoryContext? {
        val file = AtomicFile(File(folder(id), "context.json"))
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return null
        val j = JSONObject(file.openRead().bufferedReader().use { it.readText() })
        return MemoryContext.read(j)
    }
    fun create(id: String, snapshot: MemoryContext) {
        check(load(id) == null) { "CONTEXT_EXISTS" } // Profile changes cannot rewrite a recorded memory.
        val file = AtomicFile(File(folder(id), "context.json")); val stream = file.startWrite()
        try { stream.write(snapshot.json().toString().toByteArray(Charsets.UTF_8)); file.finishWrite(stream) }
        catch (e: Exception) { file.failWrite(stream); throw e }
    }
    fun photos(id: String): List<File> {
        val order=runCatching { JSONArray(AtomicFile(File(folder(id),"photo-order.json")).openRead().bufferedReader().use { it.readText() }) }.getOrNull()
        val ranks=if(order==null) emptyMap() else (0 until order.length()).associate { order.getString(it) to it }
        return folder(id).listFiles()?.filter { it.extension=="jpg" }?.sortedWith(compareBy<File> { ranks[it.name]?:-1 }.thenByDescending { it.lastModified() }.thenByDescending { it.name })?:emptyList()
    }
    fun setPhotoOrder(id:String,names:List<String>) {
        require(names.all { Regex("[A-Za-z0-9.-]+\\.jpg").matches(it) })
        val file=AtomicFile(File(folder(id),"photo-order.json"));val out=file.startWrite()
        try { out.write(JSONArray(names).toString().toByteArray());file.finishWrite(out) } catch(e:Exception){file.failWrite(out);throw e}
    }
    @Synchronized fun addPhoto(id: String, input: InputStream): File {
        val existing=photos(id)
        require(existing.size < 8) { "사진은 최대 8장까지 첨부할 수 있어요." }
        val bytes = input.use { stream ->
            val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
            while (true) { val count = stream.read(buffer); if (count < 0) break
                require(out.size() + count <= 10 * 1024 * 1024) { "사진은 한 장에 10MB 이하여야 해요." }; out.write(buffer, 0, count) }
            out.toByteArray()
        }
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        require(bounds.outMimeType in setOf("image/jpeg", "image/png", "image/webp") && bounds.outWidth > 0 && bounds.outHeight > 0) { "JPG·PNG·WebP 사진을 선택해 주세요." }
        require(bounds.outWidth.toLong() * bounds.outHeight <= 40_000_000) { "사진 해상도가 너무 커요. 크기를 줄여 주세요." }
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 1600) sample *= 2
        var bitmap = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }))
        val orientation = runCatching { android.media.ExifInterface(bytes.inputStream())
            .getAttributeInt(android.media.ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)
        val matrix = android.graphics.Matrix().apply {
            when (orientation) {
                2 -> setScale(-1f, 1f)
                3 -> setRotate(180f)
                4 -> setScale(1f, -1f)
                5 -> { setRotate(90f); postScale(-1f, 1f) }
                6 -> setRotate(90f)
                7 -> { setRotate(270f); postScale(-1f, 1f) }
                8 -> setRotate(270f)
            }
        }
        if (!matrix.isIdentity) {
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated !== bitmap) { bitmap.recycle(); bitmap = rotated }
        }
        val target = File(folder(id), "${UUID.randomUUID()}.jpg")
        val atomic = AtomicFile(target); val stream = atomic.startWrite()
        try {
            check(bitmap.compress(Bitmap.CompressFormat.JPEG, 88, stream)); atomic.finishWrite(stream)
        } catch (e: Exception) { atomic.failWrite(stream); throw e } finally { bitmap.recycle() }
        setPhotoOrder(id,listOf(target.name)+existing.map { it.name })
        return target // Decoded pixels only: no copied EXIF/location metadata.
    }
    fun deletePhoto(id: String, photo: File): Boolean {
        require(photo.parentFile?.canonicalFile == folder(id).canonicalFile && photo.extension == "jpg")
        return photo.delete()
    }
    fun delete(id: String): Boolean = folder(id).deleteRecursively()
}
