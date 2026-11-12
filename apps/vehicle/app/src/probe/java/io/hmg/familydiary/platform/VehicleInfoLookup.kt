package io.hmg.familydiary.platform

import android.car.Car
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/** Read-only AAOS metadata, probe flavor only. No VIN, location, subscription or vehicle control. */
class VehicleInfoLookup(private val context: Context) {
    data class Result(val values: Map<String, String> = emptyMap(), val emulator: Boolean = false, val notice: String)
    private val handler = Handler(Looper.getMainLooper())
    private var car: Car? = null
    private var generation = 0
    private var timeout: Runnable? = null
    fun cancel() {
        generation++
        timeout?.let(handler::removeCallbacks); timeout = null
        runCatching { car?.disconnect() }; car = null
    }
    fun read(done: (Result) -> Unit) {
        cancel()
        val ticket = generation
        fun finish(result: Result) { if (ticket == generation) { cancel(); done(result) } }
        if (Build.VERSION.SDK_INT < 29 || !context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)) {
            finish(Result(notice = "이 기기에서는 차량 정보를 조회할 수 없어요. 직접 입력해 주세요.")); return
        }
        val emulator = Build.FINGERPRINT.contains("generic") || Build.HARDWARE.contains("ranchu") || Build.HARDWARE.contains("goldfish")
        timeout = Runnable { finish(Result(notice = "차량 정보 조회가 지연돼요. 직접 입력하거나 다시 조회해 주세요.")) }.also { handler.postDelayed(it, 7000) }
        try {
            car = Car.createCar(context, handler, Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { connected, ready ->
                handler.post {
                    if (ticket != generation) { runCatching { connected.disconnect() }; return@post }
                    if (!ready) { finish(Result(notice = "차량 정보 서비스에 연결하지 못했어요. 직접 입력해 주세요.")); return@post }
                    Thread({
                        val result = runCatching {
                            val manager = connected.getCarManager(Car.PROPERTY_SERVICE) as CarPropertyManager
                            val supported = manager.propertyList.map { it.propertyId }.toSet()
                            fun value(id: Int): Any? = if (id !in supported) null else runCatching {
                                manager.getProperty<Any>(id, 0)?.takeIf { it.status == CarPropertyValue.STATUS_AVAILABLE }?.value
                            }.getOrNull()
                            val values = mutableMapOf<String, String>()
                            VehicleDefaults.text(value(VehiclePropertyIds.INFO_MAKE) as? String)?.let { values["brand"] = it }
                            VehicleDefaults.text(value(VehiclePropertyIds.INFO_MODEL) as? String)?.let { values["model"] = it }
                            VehicleDefaults.year(value(VehiclePropertyIds.INFO_MODEL_YEAR) as? Int)?.let { values["year"] = it }
                            Result(values, emulator, if (values.isEmpty()) "조회 가능한 차량 정보가 없어요. 직접 입력해 주세요."
                                else if (emulator) "에뮬레이터 정보로 빈 항목을 채웠어요. 실제 차량 정보가 아니며 수정할 수 있어요."
                                else "차량에서 조회한 정보로 빈 항목을 채웠어요. 확인·수정한 뒤 저장해 주세요.")
                        }.getOrElse { Result(notice = "차량 정보 조회가 지원되지 않거나 권한이 없어요. 직접 입력해 주세요.") }
                        handler.post { finish(result) }
                    }, "vehicle-info-read").start()
                }
            }
        } catch (_: Exception) { finish(Result(notice = "차량 정보를 조회하지 못했어요. 직접 입력해 주세요.")) }
          catch (_: LinkageError) { finish(Result(notice = "이 기기에서는 차량 정보 조회를 지원하지 않아요.")) }
    }
}
