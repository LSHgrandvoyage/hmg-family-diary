package io.hmg.familydiary.capture

/** Index bounds only; callers enforce access and return metadata, never diary bodies. */
object ListenWindow {
    fun indices(size:Int,anchor:Int,direction:String):IntRange {
        if(size<=0)return IntRange.EMPTY
        val at=anchor.coerceIn(0,size-1)
        return when(direction) {
            "before"->(at-8).coerceAtLeast(0) until at
            "after"->(at+1)..(at+8).coerceAtMost(size-1)
            else->(at-8).coerceAtLeast(0)..(at+8).coerceAtMost(size-1)
        }
    }
}
