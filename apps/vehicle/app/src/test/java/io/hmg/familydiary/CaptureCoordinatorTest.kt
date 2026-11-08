package io.hmg.familydiary
import io.hmg.familydiary.capture.CaptureCoordinator
import org.junit.Assert.*
import org.junit.Test
class CaptureCoordinatorTest {
    @Test fun unknownCannotStart() {
        val c = CaptureCoordinator {}
        assertThrows(IllegalStateException::class.java) { c.start("parent") }
    }
    @Test fun lateResultKeepsPreviousSpeaker() {
        val c = CaptureCoordinator {}
        c.observe(CaptureCoordinator.Parked.PARKED, true, true)
        val first = c.start("parent"); val second = c.selectMember("child")
        assertEquals("parent", c.memberForResult(first.id)); assertEquals("child", c.memberForResult(second.id))
        assertNull(c.memberForResult(999))
    }
    @Test fun unsafeStateStopsAndDoesNotAutomaticallyResume() {
        for (unsafe in CaptureCoordinator.Parked.entries.filter { it != CaptureCoordinator.Parked.PARKED }) {
            var stops = 0
            val c = CaptureCoordinator { stops++ }
            c.observe(CaptureCoordinator.Parked.PARKED, true, true); c.start("parent")
            c.observe(unsafe, true, true)
            assertEquals(1, stops); assertEquals(CaptureCoordinator.State.INTERRUPTED, c.state)
            c.observe(CaptureCoordinator.Parked.PARKED, true, true)
            assertEquals(CaptureCoordinator.State.INTERRUPTED, c.state)
        }
    }
    @Test fun focusAndUxRestrictionStop() {
        for (flags in listOf(false to true, true to false)) {
            var stops = 0
            val c = CaptureCoordinator { stops++ }
            c.observe(CaptureCoordinator.Parked.PARKED, true, true); c.start("child")
            c.observe(CaptureCoordinator.Parked.PARKED, flags.first, flags.second)
            assertEquals(1, stops); assertFalse(c.allowed)
        }
    }
}
