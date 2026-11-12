package io.hmg.familydiary.platform
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object CapabilityProbe {
    fun describe(context: Context): String = listOf(
        "Android API ${Build.VERSION.SDK_INT}",
        "ABI ${Build.SUPPORTED_ABIS.joinToString()}",
        "Automotive feature: ${context.packageManager.hasSystemFeature(PackageManager.FEATURE_AUTOMOTIVE)}",
        "G1 원본 음성 + 동일 입력 STT: 미검증",
        "G2 실제 주행/주차 신호 및 기능별 허용: 미검증 · 사용 잠금"
    ).joinToString("\n")
}
