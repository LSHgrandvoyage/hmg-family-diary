package io.hmg.familydiary
import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Button
import io.hmg.familydiary.capture.CaptureCoordinator

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val status = TextView(this).apply { textSize=22f; text="주차 상태 불명 · 잠금" }
        val policy = CaptureCoordinator { status.text="기록·재생 중단 · 완료 원본 보존" }
        val root=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(40,32,40,32) }
        root.addView(TextView(this).apply { text="가족의 이야기 / 합성 시연\n실제 마이크·차량 신호를 사용하지 않습니다."; textSize=26f })
        root.addView(status)
        fun action(label:String, block:()->Unit) { root.addView(Button(this).apply { text=label; setOnClickListener { block() } }) }
        action("모의 P 상태") { policy.observe(CaptureCoordinator.Parked.PARKED,true,true); status.text="모의 주차 확인 · 명시적으로 시작하세요" }
        action("합성 이야기 보기") { if(policy.allowed) { if(policy.state!=CaptureCoordinator.State.ACTIVE) policy.start("parent"); status.text="보호자: 바다가 좋았어.\n아이: 파도가 무서웠어.\n\n서로 다른 마음을 함께 보관해요." } else status.text="주차 확인이 필요해요" }
        action("모의 D / 출발") { policy.observe(CaptureCoordinator.Parked.NOT_PARKED,true,true) }
        action("모의 상태 불명") { policy.observe(CaptureCoordinator.Parked.UNKNOWN,true,true) }
        setContentView(root)
    }
}
