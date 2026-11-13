package io.hmg.familydiary.capture

/** Bounded utterances permit honest sentence-level resume without an SDK seek API. */
object NarrationSegments {
    fun split(text:String):List<String> = text.trim().split(Regex("(?<=[.!?。！？])\\s+|\\n+"))
        .filter {it.isNotBlank()}.flatMap { sentence ->
            val result=mutableListOf<String>();var rest=sentence.trim()
            while(rest.codePointCount(0,rest.length)>240) {
                val edge=rest.offsetByCodePoints(0,240)
                val space=rest.lastIndexOf(' ',edge).takeIf{it>edge/2}?:edge
                result.add(rest.substring(0,space).trim());rest=rest.substring(space).trimStart()
            }
            if(rest.isNotBlank())result.add(rest)
            result
        }
}
