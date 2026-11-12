package io.hmg.familydiary.capture

import java.io.File
import java.io.RandomAccessFile
import kotlin.math.sqrt

/** Read-only RMS envelope, bounded samples per bin even for long originals. */
object WaveEnvelope {
    fun read(file:File,bins:Int=128):List<Double> {
        require(bins>0)
        val bytes=PcmWave.payloadBytes(file);val samples=bytes/2
        return RandomAccessFile(file,"r").use { input ->
            (0 until bins).map { bin ->
                val start=bin*samples/bins;val end=maxOf(start+1,(bin+1)*samples/bins).coerceAtMost(samples)
                val count=minOf(256L,end-start).toInt();var sum=0.0
                for(j in 0 until count) {
                    val index=start+j*(end-start)/count
                    input.seek(PcmWave.HEADER_BYTES+index*2)
                    val sample=(input.readUnsignedByte() or (input.readByte().toInt() shl 8)).toShort().toDouble()/32768.0
                    sum+=sample*sample
                }
                if(count==0)0.0 else sqrt(sum/count)
            }
        }
    }
}
