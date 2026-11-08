"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { PhotoGallery } from "./PhotoGallery";
import { RevisitMemories } from "./RevisitMemories";
import { RecordingContextCard } from "./RecordingContextCard";
import { AppShell } from "./AppShell";
import { Icon } from "./Icon";
import { AudioPlayer, type PlaybackRequest, stamp } from "./AudioPlayer";
import { members, demoRecording, type DiaryRecord } from "../demo/records";
export function DiaryDetail({
  record,
  initialTab = "diary",
}: {
  record: DiaryRecord;
  initialTab?: "diary" | "source";
}) {
  const [request, setRequest] = useState<PlaybackRequest | null>(null);
  const [tab, setTab] = useState<"diary" | "source">(initialTab);
  const sequence = useRef(0);
  const diaryTab = useRef<HTMLButtonElement>(null);
  const sourceTab = useRef<HTMLButtonElement>(null);
  const segments = record.memories.map((m, i) => ({
    id: m.member,
    ...demoRecording.spans[i],
    name: members[i].name,
    avatar: members[i].avatar,
    source: m.source,
  }));
  function listen(position: number) {
    setRequest({ position, id: ++sequence.current });
    setTab("source");
    sourceTab.current?.focus();
    sourceTab.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  function closePlayer() {
    setTab("diary");
    setRequest(null);
    diaryTab.current?.focus();
  }
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
              <p className="diary-context-summary">
                {record.context.vehicle
                  ? `${record.context.vehicle.model ?? record.context.vehicle.nickname}에서 남긴 기록`
                  : "차량 정보 없는 기록"}{" "}
                · 녹음 당시 정보 보관
              </p>
            </header>
            <div
              className="seg reading-tabs"
              role="group"
              aria-label="읽기 방식"
            >
              <button
                ref={diaryTab}
                className={`seg-item ${tab === "diary" ? "is-selected" : ""}`}
                aria-pressed={tab === "diary"}
                onClick={closePlayer}
              >
                정리된 일기
              </button>
              <button
                ref={sourceTab}
                className={`seg-item ${tab === "source" ? "is-selected" : ""}`}
                aria-pressed={tab === "source"}
                onClick={() => {
                  setRequest(null);
                  setTab("source");
                }}
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
              <AudioPlayer
                src={demoRecording.src}
                segments={segments}
                request={request}
                onClose={closePlayer}
              />
            )}
            <PhotoGallery key={record.id} recordId={record.id} />
          </article>
          <aside className="memory-panel">
            <RevisitMemories record={record} />
            <RecordingContextCard context={record.context} />
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
                      onClick={() => listen(segments[i].start)}
                    >
                      <Icon name="play" />
                      이야기 듣기
                      <span className="clip-time">
                        {stamp(segments[i].start)}부터
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
            <button className="whole-recording" onClick={() => listen(0)}>
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
      </main>
    </AppShell>
  );
}
