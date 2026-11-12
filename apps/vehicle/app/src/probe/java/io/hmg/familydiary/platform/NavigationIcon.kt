package io.hmg.familydiary.platform

import android.graphics.*
import android.graphics.drawable.Drawable

/** Small line icons matching the reference rail; labels remain visible and accessible. */
class NavigationIcon(private val kind: Int, private val tint: Int) : Drawable() {
    private val pen = Paint(Paint.ANTI_ALIAS_FLAG).apply { color=tint; style=Paint.Style.STROKE; strokeWidth=1.8f; strokeCap=Paint.Cap.ROUND; strokeJoin=Paint.Join.ROUND }
    override fun draw(canvas: Canvas) {
        val save=canvas.save();canvas.translate(bounds.left.toFloat(),bounds.top.toFloat());canvas.scale(bounds.width()/24f,bounds.height()/24f)
        when(kind) {
            0 -> { canvas.drawRoundRect(5f,3f,19f,21f,2f,2f,pen);canvas.drawLine(9f,8f,15f,8f,pen);canvas.drawLine(9f,12f,13f,12f,pen) }
            1 -> { canvas.drawRoundRect(9f,2f,15f,15f,3f,3f,pen);canvas.drawArc(5f,5f,19f,19f,0f,180f,false,pen);canvas.drawLine(12f,19f,12f,22f,pen) }
            else -> { canvas.drawLine(3f,7f,21f,7f,pen);canvas.drawLine(3f,17f,21f,17f,pen);canvas.drawCircle(9f,7f,3f,pen);canvas.drawCircle(16f,17f,3f,pen) }
        }
        canvas.restoreToCount(save)
    }
    override fun setAlpha(alpha: Int) { pen.alpha=alpha }
    override fun setColorFilter(filter: ColorFilter?) { pen.colorFilter=filter }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}
