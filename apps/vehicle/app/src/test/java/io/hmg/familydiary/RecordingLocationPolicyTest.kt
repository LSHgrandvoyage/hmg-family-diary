package io.hmg.familydiary
import io.hmg.familydiary.platform.RecordingLocationPolicy
import org.junit.Assert.*
import org.junit.Test
class RecordingLocationPolicyTest {
 @Test fun observationMustPrecedeStartAndBeFresh(){
  assertEquals("available",RecordingLocationPolicy.status(100000,70000,37.0,127.0))
  assertEquals("stale",RecordingLocationPolicy.status(100000,69999,37.0,127.0))
  assertEquals("error",RecordingLocationPolicy.status(100000,100001,37.0,127.0))
  assertEquals("error",RecordingLocationPolicy.status(100000,0,37.0,127.0))
  assertEquals("error",RecordingLocationPolicy.status(100000,90000,Double.NaN,127.0))
  assertEquals("error",RecordingLocationPolicy.status(100000,90000,37.0,181.0))
 }
}
