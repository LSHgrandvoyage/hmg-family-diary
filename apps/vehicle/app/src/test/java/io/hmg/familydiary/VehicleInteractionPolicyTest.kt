package io.hmg.familydiary
import io.hmg.familydiary.capture.VehicleInteractionPolicy as P
import io.hmg.familydiary.capture.CaptureCoordinator as C
import org.junit.Assert.*
import org.junit.Test
class VehicleInteractionPolicyTest {
 @Test fun drivingOnlyAllowsExplicitAudioCommands() {
  val d=P.access(P.Motion.DRIVING,true,true,true,true)
  assertTrue(d.audio);assertFalse(d.review)
  for(cmd in listOf("driveAction","start","finish","play","pauseCapture","stopPlayback","seek","state","ttsPrevious","ttsNext"))assertTrue(cmd,P.permits(cmd,d))
  for(cmd in listOf("read","list","edit","delete","removePhoto","createDiary","saveDiary","tts","ttsQueue","playSegment","share","settings","unknown"))assertFalse(cmd,P.permits(cmd,d))
 }
 @Test fun unknownAndMissingPlatformConsentOrForegroundNeverGrantAudio() {
  for(m in P.Motion.entries) {
   assertFalse(P.access(m,false,true,true,true).audio)
   assertFalse(P.access(m,true,false,true,true).audio)
   assertFalse(P.access(m,true,true,false,true).audio)
  }
  val u=P.access(P.Motion.UNKNOWN,true,true,true,true);assertFalse(u.audio);assertFalse(u.review)
  assertTrue(P.access(P.Motion.PARKED,true,true,true,true).review)
  assertFalse(P.access(P.Motion.PARKED,true,true,true,false).review)
 }
 @Test fun explicitDrivingGrantPreservesActiveCaptureButRevocationStopsWithoutResume() {
  var stops=0;val c=C{stops++}
  c.observe(C.Parked.PARKED,true,true);c.start("family")
  c.observe(C.Parked.NOT_PARKED,true,true,true);assertEquals(C.State.ACTIVE,c.state);assertEquals(0,stops)
  c.observe(C.Parked.UNKNOWN,true,true,true);assertEquals(C.State.INTERRUPTED,c.state);assertEquals(1,stops)
  c.observe(C.Parked.NOT_PARKED,true,true,true);assertEquals(C.State.INTERRUPTED,c.state)
 }
}
