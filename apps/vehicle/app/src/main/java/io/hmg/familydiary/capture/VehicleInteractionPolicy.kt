package io.hmg.familydiary.capture

/** A driving grant must come from the platform policy, never merely from speed zero. */
object VehicleInteractionPolicy {
    enum class Motion { PARKED, DRIVING, UNKNOWN }
    data class Access(val audio:Boolean, val review:Boolean)
    fun access(motion:Motion, foreground:Boolean, consent:Boolean, platformAudio:Boolean, platformReview:Boolean):Access {
        val known=motion!=Motion.UNKNOWN && foreground && consent
        return Access(known && platformAudio, known && motion==Motion.PARKED && platformReview)
    }
    private val audioCommands=setOf("driveAction","state","start","pauseCapture","finish","play","seek","stopPlayback","togglePlayback","ttsPrevious","ttsNext")
    fun permits(command:String,access:Access)=if(command in audioCommands)access.audio else access.review
}
