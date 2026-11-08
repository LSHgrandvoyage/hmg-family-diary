"use client";
import { useState } from "react";
import Link from "next/link";
import { AudioPlayer } from "../../components/AudioPlayer";
export default function Demo() {
  const [selection, setSelection] = useState<{
    start: number;
    end: number;
    label: string;
  } | null>(null);
  const [showSource, setShowSource] = useState(false);
  return (
    <>
      <header className="header">
        <Link href="/" className="brand">
          가족의 이야기<span>OUR FAMILY JOURNAL</span>
        </Link>
        <span className="demo-badge">합성 자료 미리 보기</span>
      </header>
      <main id="main" className="journal">
        <aside className="shelf">
          <p className="eyebrow">우리의 보관함</p>
          <h2>함께한 날들</h2>
          <p className="muted">
            대단한 여행이 아니어도,
            <br />
            오래 기억하고 싶은 순간.
          </p>
          <a className="selected-entry" href="#entry">
            <time dateTime="2026-11-08">11월 8일 · 일요일</time>
            <strong>같은 바다, 서로 다른 마음</strong>
            <span>보호자와 아이의 이야기</span>
          </a>
          <p className="shelf-note">
            화면 확인을 위해 만든 예시 일기 1개가 있어요.
          </p>
        </aside>
        <article id="entry" className="paper">
          <div className="entry-meta">
            <time dateTime="2026-11-08">2026. 11. 08.</time>
            <span>가족 나들이 · 예시</span>
          </div>
          <h1>
            같은 바다,
            <br />
            서로 다른 마음
          </h1>
          <p className="lede">
            같은 곳을 보고도 마음에 남는 것은 달랐던 날.
            <br className="desktop-break" /> 우리가 나눈 이야기를 함께 남겼다.
          </p>
          <div className="rule" />
          <section aria-labelledby="memories">
            <h2 id="memories" className="section-title">
              각자의 기억
            </h2>
            <div className="memory">
              <span className="speaker parent">보호자</span>
              <blockquote>바다를 바라보는 시간이 좋았다.</blockquote>
              <button
                className="listen"
                onClick={() =>
                  setSelection({
                    start: 0,
                    end: 4,
                    label: "보호자 이야기 · 0–4초",
                  })
                }
              >
                이 이야기의 소리 듣기 <span aria-hidden="true">↗</span>
              </button>
            </div>
            <div className="memory">
              <span className="speaker child">아이</span>
              <blockquote>파도가 무서웠다.</blockquote>
              <button
                className="listen"
                onClick={() =>
                  setSelection({
                    start: 4,
                    end: 8,
                    label: "아이 이야기 · 4–8초",
                  })
                }
              >
                이 이야기의 소리 듣기 <span aria-hidden="true">↗</span>
              </button>
            </div>
          </section>
          <div className="record">
            <div>
              <h2>말했던 그대로도 남아 있어요</h2>
              <p>일기로 정리한 문장과 원래 이야기를 오가 보세요.</p>
            </div>
            <button
              className="primary"
              onClick={() =>
                setSelection({ start: 0, end: 8, label: "전체 시험음 · 8초" })
              }
            >
              전체 소리 듣기
            </button>
            <button
              className="text-button"
              aria-expanded={showSource}
              onClick={() => setShowSource((s) => !s)}
            >
              {showSource ? "원래 이야기 접기" : "원래 이야기 펼치기"}
            </button>
          </div>
          {showSource && (
            <div className="transcript">
              <p>
                <strong>보호자 · 0–4초</strong>
                <br />
                바다가 좋았어.
              </p>
              <p>
                <strong>아이 · 4–8초</strong>
                <br />
                파도가 무서웠어.
              </p>
              <small>
                합성 텍스트 예시이며 시험음에서 인식한 문장이 아닙니다.
              </small>
            </div>
          )}
          {selection && (
            <AudioPlayer
              src="/demo/synthetic-signal.wav"
              selection={selection}
              onClose={() => setSelection(null)}
            />
          )}
          <footer className="entry-footer">
            이 화면은 합성 예시입니다. 실제 LLM 생성·차량 녹음·계정 동기화는
            아직 연결되지 않았어요.
          </footer>
        </article>
      </main>
    </>
  );
}
