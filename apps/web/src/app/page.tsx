import Link from "next/link";
export default function Home() {
  return (
    <main id="main" className="welcome">
      <p className="eyebrow">가족의 이야기</p>
      <h1>
        함께한 날을,
        <br />
        다시 꺼내 보는 시간.
      </h1>
      <p>
        차 안에서 나눈 이야기는 일기가 되고,
        <br />
        그날의 목소리는 기억 곁에 남아요.
      </p>
      <Link className="primary" href="/demo">
        일기 화면 미리 보기
      </Link>
      <p className="muted">
        현재는 합성 자료로 읽기·재생 흐름을 확인하는 개발 버전이에요.
        <br />
        실제 가족의 녹음이나 개인정보를 입력하지 마세요.
      </p>
    </main>
  );
}
