package io.hmg.familydiary.platform
import io.hmg.familydiary.capture.SpeechSegment
import org.json.JSONArray
import org.json.JSONObject

object SpeechTimeline {
    fun encode(rows:List<SpeechSegment>,text:String,rawIndex:Int,duration:Long):String? {
        if(rows.isEmpty() || rows.size>500 || rows.joinToString("\n"){it.text}!=text)return null
        var end=0L
        val entries=JSONArray()
        rows.forEachIndexed {i,row->
            val valid=row.startMs!=null && row.endMs!=null && row.startMs>=end && row.endMs>row.startMs && row.endMs<=duration
            if(valid)end=row.endMs!!
            entries.put(JSONObject().put("id","segment-${i+1}").put("text",row.text)
                .put("start_ms",if(valid)row.startMs else JSONObject.NULL).put("end_ms",if(valid)row.endMs else JSONObject.NULL))
        }
        return JSONObject().put("source","pleos_epd_pcm_v1").put("raw_history_index",rawIndex).put("segments",entries).toString()
    }
}
