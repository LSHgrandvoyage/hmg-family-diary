import Link from "next/link";
import { useState } from "react";
import type { SyncedMemory } from "../../../../packages/sync/src/snapshot";
import type { DiaryOutput } from "../../../../packages/contracts/src/diary";
import { Icon } from "./Icon";
export function MemoryList({
  items,
  filtered,
  query,
  setQuery,
  loading,
}: {
  items: SyncedMemory[];
  filtered: SyncedMemory[];
  query: string;
  setQuery: (s: string) => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState(false);
  const groups = new Map<string, SyncedMemory[]>();
  for (const m of [...filtered].sort((a, b) =>
    b.snapshot.recorded_at.localeCompare(a.snapshot.recorded_at),
  )) {
    const key = new Date(m.snapshot.recorded_at).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Seoul",
    });
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return (
    <section className="chagok-archive">
      <div className="chagok-library-heading">
        <h1>
          우리 가족
          <br />차 안의 이야기
        </h1>
        <button
          className="appbar-btn"
          aria-label="이야기 검색"
          aria-expanded={search}
          onClick={() => setSearch(!search)}
        >
          <Icon name="search" />
        </button>
      </div>
      {search && (
        <label className="search">
          <Icon name="search" />
          <span className="visually-hidden">이야기와 차량 검색</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이야기나 차량 이름으로 찾기"
          />
        </label>
      )}
      {[...groups].map(([month, memories]) => (
        <section className="chagok-month" key={month}>
          <div className="chagok-month-heading">
            <h2>{month}</h2>
            <span>일기 {memories.length}개</span>
          </div>
          <div className="chagok-story-list">
            {memories.map((m) => {
              const d = new Date(m.snapshot.recorded_at);
              const draft = JSON.parse(m.snapshot.draft) as DiaryOutput;
              return (
                <Link
                  className="chagok-story"
                  href={`/library/${m.id}`}
                  key={m.id}
                >
                  <span className="chagok-date">
                    <strong>
                      {d.toLocaleDateString("en-US", {
                        day: "2-digit",
                        timeZone: "Asia/Seoul",
                      })}
                    </strong>
                    <span>
                      {d.toLocaleDateString("ko-KR", {
                        weekday: "long",
                        timeZone: "Asia/Seoul",
                      })}
                    </span>
                  </span>
                  <span className="chagok-story-content">
                    <strong>{draft.groups[0]?.label ?? "우리의 이야기"}</strong>
                    <span className="chagok-excerpt">
                      {draft.groups
                        .flatMap((g) => g.statements.map((s) => s.text))
                        .join(" ")}
                    </span>
                    <span className="chagok-story-meta">
                      <span>
                        <Icon name="mic" />
                        {Math.max(1, Math.ceil(m.snapshot.duration_ms / 60000))}
                        분
                      </span>
                      {m.photos.length > 0 && (
                        <span>사진 {m.photos.length}장</span>
                      )}
                      <span>{m.snapshot.speaker}</span>
                    </span>
                    {!m.audio_ready && (
                      <span className="row-sub">원본 전송 대기</span>
                    )}
                  </span>
                  {m.photos[0] && (
                    <img
                      className="chagok-story-photo"
                      src={`/api/v1/sessions/${m.id}/photos/${m.photos[0].id}`}
                      alt=""
                      loading="lazy"
                    />
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
      {!loading && !filtered.length && (
        <div className="chagok-empty">
          <Icon name="book" />
          <h2>
            {query ? "찾는 이야기가 없어요" : "첫 이야기를 기다리고 있어요"}
          </h2>
          <p>
            {query
              ? "다른 단어로 찾아보세요."
              : "차량에서 일기를 저장하고 휴대폰에 공유하면, 그날의 목소리와 사진이 여기에 모여요."}
          </p>
          {!items.length && (
            <Link className="btn primary" href="/devices">
              차량 연결하기
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
