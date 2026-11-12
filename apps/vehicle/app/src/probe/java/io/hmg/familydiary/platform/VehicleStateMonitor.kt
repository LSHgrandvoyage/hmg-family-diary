package io.hmg.familydiary.platform

import android.car.Car
import android.car.VehicleGear
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.car.drivingstate.CarUxRestrictions
import android.car.drivingstate.CarUxRestrictionsManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import io.hmg.familydiary.capture.VehicleInteractionPolicy.Motion

/** Live AAOS signals; a clear UX restriction alone never proves gear P. */
class VehicleStateMonitor(private val context:Context, private val update:(Motion,String)->Unit) {
    private val handler=Handler(Looper.getMainLooper())
    private var car:Car?=null
    private var properties:CarPropertyManager?=null
    private var ux:CarUxRestrictionsManager?=null
    private var gear:Int?=null
    private var restrictions:CarUxRestrictions?=null
    private var generation=0
    private val propertyCallback=object:CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(value:CarPropertyValue<*>) {
            if(value.propertyId==VehiclePropertyIds.GEAR_SELECTION){gear=if(value.status==CarPropertyValue.STATUS_AVAILABLE)value.value as? Int else null;emit()}
        }
        override fun onErrorEvent(propertyId:Int,areaId:Int) {if(propertyId==VehiclePropertyIds.GEAR_SELECTION){gear=null;emit()}}
    }
    private fun emit() {
        val r=restrictions
        val motion=when {
            gear !in setOf(VehicleGear.GEAR_PARK,VehicleGear.GEAR_NEUTRAL,VehicleGear.GEAR_REVERSE,VehicleGear.GEAR_DRIVE,VehicleGear.GEAR_FIRST,VehicleGear.GEAR_SECOND,VehicleGear.GEAR_THIRD,VehicleGear.GEAR_FOURTH,VehicleGear.GEAR_FIFTH,VehicleGear.GEAR_SIXTH,VehicleGear.GEAR_SEVENTH,VehicleGear.GEAR_EIGHTH,VehicleGear.GEAR_NINTH) || r==null -> Motion.UNKNOWN
            gear==VehicleGear.GEAR_PARK && !r.isRequiresDistractionOptimization && r.activeRestrictions==CarUxRestrictions.UX_RESTRICTIONS_BASELINE -> Motion.PARKED
            else -> Motion.DRIVING
        }
        update(motion,if(motion==Motion.UNKNOWN)"차량 상태 확인 필요" else if(motion==Motion.PARKED)"차량 신호 · P" else "차량 신호 · 음성 모드")
    }
    fun start() {
        close();val token=generation
        update(Motion.UNKNOWN,"차량 신호 연결 중")
        try {
            car=Car.createCar(context,handler,Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT){connected,ready->
                handler.post {
                    if(token!=generation)return@post
                    if(!ready){gear=null;restrictions=null;emit();return@post}
                    try {
                        properties=connected.getCarManager(Car.PROPERTY_SERVICE) as CarPropertyManager
                        ux=connected.getCarManager(Car.CAR_UX_RESTRICTION_SERVICE) as CarUxRestrictionsManager
                        restrictions=ux!!.currentCarUxRestrictions
                        ux!!.registerListener { value -> if(token==generation){restrictions=value;emit()} }
                        check(properties!!.registerCallback(propertyCallback,VehiclePropertyIds.GEAR_SELECTION,CarPropertyManager.SENSOR_RATE_ONCHANGE))
                        val value=properties!!.getProperty<Int>(VehiclePropertyIds.GEAR_SELECTION,0)
                        gear=if(value?.status==CarPropertyValue.STATUS_AVAILABLE)value.value else null
                        emit()
                    }catch(_:Exception){gear=null;restrictions=null;emit()}
                }
            }
        }catch(_:Exception){gear=null;restrictions=null;emit()}
         catch(_:LinkageError){gear=null;restrictions=null;emit()}
    }
    fun close() {
        generation++
        runCatching{properties?.unregisterCallback(propertyCallback)};runCatching{ux?.unregisterListener()};runCatching{car?.disconnect()}
        car=null;properties=null;ux=null;gear=null;restrictions=null
    }
}
