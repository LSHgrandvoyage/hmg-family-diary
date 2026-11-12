package io.hmg.familydiary
import android.app.Activity
import android.os.Bundle
import android.widget.TextView
import io.hmg.familydiary.platform.CapabilityProbe

/** No synthetic source is compiled into this flavor. Unknown parking remains locked. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply {
            textSize = 24f; setPadding(40,40,40,40)
            text = "가족의 이야기\n\n차량 연결을 확인하고 있어요.\n차량 상태와 기능별 허용을 확인하기 전에는 기록과 재생을 시작할 수 없어요.\n\n" + CapabilityProbe.describe(this@MainActivity)
        })
    }
}
