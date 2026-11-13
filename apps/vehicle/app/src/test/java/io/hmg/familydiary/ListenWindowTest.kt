package io.hmg.familydiary
import io.hmg.familydiary.capture.ListenWindow
import io.hmg.familydiary.capture.NarrationSegments
import org.junit.Assert.*
import org.junit.Test
class ListenWindowTest {
 @Test fun centeredPagesReachBothEndsWithoutDuplicatesOrGaps(){
  val first=ListenWindow.indices(41,20,"around").toList();assertEquals((12..28).toList(),first)
  val before=ListenWindow.indices(41,first.first(),"before").toList();assertEquals((4..11).toList(),before)
  val after=ListenWindow.indices(41,first.last(),"after").toList();assertEquals((29..36).toList(),after)
  assertEquals((0..3).toList(),ListenWindow.indices(41,before.first(),"before").toList())
  assertEquals((37..40).toList(),ListenWindow.indices(41,after.last(),"after").toList())
 }
 @Test fun emptySmallAndEdgeWindows(){
  assertTrue(ListenWindow.indices(0,0,"around").isEmpty())
  assertEquals((0..3).toList(),ListenWindow.indices(4,0,"around").toList())
  assertTrue(ListenWindow.indices(4,0,"before").isEmpty());assertTrue(ListenWindow.indices(4,3,"after").isEmpty())
 }
 @Test fun narrationKeepsAllWordsAndDoesNotSplitSurrogatePairs(){
  val text="첫 문장입니다. 다음 문장입니다!\n세 번째 문장입니다."
  assertEquals(listOf("첫 문장입니다.","다음 문장입니다!","세 번째 문장입니다."),NarrationSegments.split(text))
  val long="😀가족 이야기 ".repeat(90)
  val split=NarrationSegments.split(long)
  assertTrue(split.size>1);assertTrue(split.all{it.codePointCount(0,it.length)<=240})
  assertEquals(long.filterNot{it.isWhitespace()},split.joinToString("").filterNot{it.isWhitespace()})
  assertFalse(split.any{it.first().isLowSurrogate()||it.last().isHighSurrogate()})
 }
}
