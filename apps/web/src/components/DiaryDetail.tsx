"use client";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "./AppShell";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { AudioPlayer } from "./AudioPlayer";
import { members, type DiaryRecord } from "../demo/records";
export function DiaryDetail({ record }: { record: DiaryRecord }) {
  const [selection, setSelection] = useState<number | null>(null);
  const [tab, setTab] = useState<"diary" | "source">("diary");
  const member =
    selection !== null && selection >= 0 ? members[selection] : null;
  return (
    <AppShell>
      <main id="main" className="detail-layout">
        <nav className="detail-nav" aria-label="이전 화면">
          <Link href="/demo" className="back-link">
            <Icon name="back" />
            보관함
          </Link>
          <span className="row-sub">샘플 일기</span>
        </nav>
        <div className="detail-columns">
          <article className="detail-paper">
            <header className="detail-heading">
              <span className="detail-art">
                <img src={`/design/${record.art}.svg`} alt="" />
              </span>
              <p className="row-sub">
                {record.day} · {record.place}
              </p>
              <h1 className="title">{record.title}</h1>
              <div className="member-line">
                <span className="avatars">
                  {members.map((m) => (
                    <span className="avatar" key={m.id}>
                      <img src={m.avatar} alt="" />
                    </span>
                  ))}
                </span>
                <span>보호자와 아이의 이야기</span>
              </div>
            </header>
            <div
              className="seg reading-tabs"
              role="group"
              aria-label="읽기 방식"
            >
              <button
                className={`seg-item ${tab === "diary" ? "is-selected" : ""}`}
                aria-pressed={tab === "diary"}
                onClick={() => setTab("diary")}
              >
                정리된 일기
              </button>
              <button
                className={`seg-item ${tab === "source" ? "is-selected" : ""}`}
                aria-pressed={tab === "source"}
                onClick={() => setTab("source")}
              >
                원래 이야기
              </button>
            </div>
            {tab === "diary" ? (
              <section className="diary-body" data-anchor>
                <h2 className="visually-hidden">정리된 일기</h2>
                <p>{record.paragraph}</p>
                <div className="diary-signature">
                  <Icon name="mic" />
                  <span>서로 다른 마음도 그대로 남겼어요.</span>
                </div>
              </section>
            ) : (
              <section
                className="transcript"
                data-anchor
                aria-label="원래 이야기"
              >
                {record.memories.map((m, i) => (
                  <div key={m.member} className="source-row">
                    <p className="row-sub">
                      {members[i].name} · {i * 4}–{i * 4 + 4}초
                    </p>
                    <p>{m.source}</p>
                    <button
                      className="btn small tint"
                      onClick={() => setSelection(i)}
                    >
                      <Icon name="play" />
                      구간 듣기
                    </button>
                  </div>
                ))}
                <p className="preview-footnote">
                  인식문 예시예요. 시험음에서 변환한 문장은 아니에요.
                </p>
              </section>
            )}
          </article>
          <aside className="memory-panel">
            <section className="block">
              <div className="block-head">
                <h2 className="h2">각자의 기억</h2>
                <span className="row-sub">2명</span>
              </div>
              <div className="memory-list">
                {record.memories.map((m, i) => (
                  <div className="memory-item" key={m.member}>
                    <div className="memory-person">
                      <span className="avatar">
                        <img src={members[i].avatar} alt="" />
                      </span>
                      <strong>{members[i].name}</strong>
                    </div>
                    <p>{m.text}</p>
                    <button
                      className="btn small tint"
                      aria-label={`${members[i].name} 이야기 듣기`}
                      onClick={() => setSelection(i)}
                    >
                      <Icon name="play" />
                      이야기 듣기
                      <span className="clip-time">
                        {i * 4}–{i * 4 + 4}초
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <button
              className="whole-recording"
              onClick={() => setSelection(-1)}
            >
              <span className="recording-icon">
                <Icon name="volume" />
              </span>
              <span>
                <strong>전체 녹음 듣기</strong>
                <small>합성 시험음 · 8초</small>
              </span>
              <Icon name="chevron" />
            </button>
            <p className="preview-footnote">
              일기와 목소리를 함께 보는 흐름을
              <br />
              샘플로 확인하고 있어요.
            </p>
          </aside>
        </div>
        {selection !== null && (
          <Sheet
            title={member ? `${member.name}의 이야기` : "전체 녹음"}
            onClose={() => setSelection(null)}
          >
            <p className="row-sub">
              {record.day} · {record.place}
            </p>
            <div className="audio-source">
              {member ? (
                <>
                  <span className="avatar">
                    <img src={member.avatar} alt="" />
                  </span>
                  <blockquote>{record.memories[selection].source}</blockquote>
                </>
              ) : (
                <blockquote>보호자와 아이의 이야기를 이어 들어요.</blockquote>
              )}
            </div>
            <AudioPlayer
              src="/demo/synthetic-signal.wav"
              selection={{
                start: selection < 0 ? 0 : selection * 4,
                end: selection < 0 ? 8 : selection * 4 + 4,
                label: member ? `${member.name} 이야기` : "전체 녹음",
              }}
              onClose={() => setSelection(null)}
            />
          </Sheet>
        )}
      </main>
    </AppShell>
  );
}
