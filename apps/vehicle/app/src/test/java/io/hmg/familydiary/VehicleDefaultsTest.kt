package io.hmg.familydiary
import io.hmg.familydiary.platform.VehicleDefaults
import org.junit.Assert.*
import org.junit.Test
class VehicleDefaultsTest {
    @Test fun lateResultPreservesUserEditsAndSavedValues() {
        assertEquals("직접 쓴 모델", VehicleDefaults.merge("직접 쓴 모델", false, "제안 모델"))
        assertEquals("", VehicleDefaults.merge("", true, "제안 모델"))
        assertEquals("제안 모델", VehicleDefaults.merge("", false, " 제안 모델 "))
    }
    @Test fun unavailableValuesDoNotBecomeFacts() {
        assertNull(VehicleDefaults.text("unknown")); assertNull(VehicleDefaults.text(" "))
        assertNull(VehicleDefaults.year(0)); assertEquals("2026", VehicleDefaults.year(2026))
    }
}
