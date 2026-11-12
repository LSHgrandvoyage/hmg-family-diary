package io.hmg.familydiary

import androidx.test.platform.app.InstrumentationRegistry
import io.hmg.familydiary.capture.PcmWave
import io.hmg.familydiary.platform.SpeechProbe
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/** Real Pleos ON_DEVICE streaming with generated Korean PCM; no microphone/user audio. */
class LiveSpeechDeviceTest {
    @Test fun updatesBeforeInputEndsAndKeepsSavedPcm() {
        val ins=InstrumentationRegistry.getInstrumentation()
        val file=File(ins.targetContext.cacheDir,"synthetic-live-${UUID.randomUUID()}.wav")
        file.writeBytes(ins.context.assets.open("synthetic-stt.wav").use { it.readBytes() })
        val hash=PcmWave.sha256(file);val done=CountDownLatch(1)
        val finishedInput=AtomicBoolean(false);val sawLive=AtomicBoolean(false)
        var result="";var status="";val probe=SpeechProbe(ins.targetContext)
        try {
            ins.runOnMainSync {probe.startLive(onStatus={status=it},onDone={done.countDown()},onUpdate={text->result=text;if(text.isNotBlank()&&!finishedInput.get())sawLive.set(true)})}
            PcmWave.stream(file) {chunk->probe.feed(chunk);Thread.sleep(chunk.size*1000L/PcmWave.BYTES_PER_SECOND)}
            finishedInput.set(true)
            ins.runOnMainSync {probe.finishLive()}
            assertTrue("STT finalize timeout",done.await(40,TimeUnit.SECONDS))
            assertTrue("No intermediate recognition while feeding synthetic PCM: $status",sawLive.get())
            assertTrue(status.startsWith("STT 최종 결과 수신"))
            fun normalized(s:String)=s.replace(Regex("[\\s.,!?]"),"")
            assertEquals(normalized("오늘 가족과 바다에 갔어요. 아이는 파도가 무서웠고 저는 바다가 좋았어요."),normalized(result))
            assertEquals(hash,PcmWave.sha256(file))
        } finally {ins.runOnMainSync{probe.cancel()};file.delete()}
    }
}
