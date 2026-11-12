package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.platform.VehicleInfoLookup
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class VehicleInfoDeviceTest {
    @Test fun lookupCompletesOrFallsBackWithoutReadingIdentifiers() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val lookup = VehicleInfoLookup(instrumentation.targetContext)
        val latch = CountDownLatch(1)
        var result: VehicleInfoLookup.Result? = null
        instrumentation.runOnMainSync { lookup.read { result = it; latch.countDown() } }
        try {
            assertTrue("bounded completion", latch.await(10, TimeUnit.SECONDS))
            assertTrue(result!!.notice.isNotBlank())
            assertTrue(result!!.values.keys.all { it in setOf("brand", "model", "year") })
            println("VEHICLE_LOOKUP keys=${result!!.values.keys} emulator=${result!!.emulator} notice=${result!!.notice}")
        } finally { instrumentation.runOnMainSync { lookup.cancel() } }
    }
}
