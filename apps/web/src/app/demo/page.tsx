"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "../../components/AppShell";
import { Icon } from "../../components/Icon";
import { members, records } from "../../demo/records";
export default function Archive() {
  const [query, setQuery] = useState("");
  const [place, setPlace] = useState("전체");
  const filtered = records.filter(
    (r) =>
      (place === "전체" || r.place === place) &&
      `${r.title} ${r.place} ${r.date} ${r.day}`.includes(query.trim()),
  );
  const recent = records[0];
  return (
    <AppShell>
      <main id="main" className="archive-layout">
        <div className="archive-primary">
          <header className="hero">
            <p className="eyebrow">우리 가족 보관함</p>
            <h1 className="title">
              함께한 날을
              <br />
              다시 꺼내 봐요
            </h1>
            <p className="lead">그날의 이야기와 목소리를 한곳에.</p>
          </header>
          <section
            className="block recent-block"
            aria-labelledby="recent-title"
          >
            <div className="block-head">
              <h2 className="h2" id="recent-title">
                최근 이야기
              </h2>
              <span className="row-sub">11월 8일</span>
            </div>
            <Link className="recent-story" href="/demo/sea" data-anchor>
              <div className="story-art">
                <img src="/design/beach.svg" alt="" />
              </div>
              <div className="recent-copy">
                <p className="row-sub">바다 · 가족 나들이</p>
                <h3>{recent.title}</h3>
                <p>{recent.description}</p>
                <div className="story-bottom">
                  <span className="avatars">
                    {members.map((m) => (
                      <span className="avatar" key={m.id}>
                        <img src={m.avatar} alt={m.name} />
                      </span>
                    ))}
                  </span>
                  <span className="story-open">
                    일기 읽기
                    <Icon name="arrow" />
                  </span>
                </div>
              </div>
            </Link>
          </section>
          <div className="quiet-note">
            <img src="/design/car.svg" alt="" />
            <div>
              <strong>차에서 남긴 이야기, 여기에서도</strong>
              <p>기록은 주차된 차에서, 다시 보기는 편한 곳에서.</p>
            </div>
          </div>
        </div>
        <section className="archive-list" aria-labelledby="all-title">
          <div className="list-heading">
            <h2 className="h2" id="all-title">
              모든 이야기 <span>{records.length}</span>
            </h2>
            <span className="row-sub">최신순</span>
          </div>
          <label className="search">
            <Icon name="search" />
            <input
              type="search"
              aria-label="이야기 검색"
              placeholder="날짜, 장소, 제목으로 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="chips" aria-label="장소 필터">
            {["전체", "바다", "공원", "카페"].map((p) => (
              <button
                key={p}
                className={`chip ${place === p ? "is-selected" : ""}`}
                aria-pressed={place === p}
                onClick={() => setPlace(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <p className="result-count" role="status">
            {filtered.length}개의 이야기
          </p>
          <div className="block is-list story-list">
            {filtered.map((r) => (
              <Link href={`/demo/${r.id}`} className="row story-row" key={r.id}>
                <span className="row-art">
                  <img src={`/design/${r.art}.svg`} alt="" />
                </span>
                <div className="row-main">
                  <p className="row-sub">{r.day}</p>
                  <h3 className="row-title">{r.title}</h3>
                  <p className="row-sub">{r.place} · 보호자, 아이</p>
                </div>
                <span className="row-trail">
                  <Icon name="chevron" />
                </span>
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="empty">
                <Icon name="search" />
                <h3 className="h2">찾는 이야기가 없어요</h3>
                <p className="row-sub">다른 날짜나 장소로 찾아보세요.</p>
                <button
                  className="btn secondary"
                  onClick={() => {
                    setQuery("");
                    setPlace("전체");
                  }}
                >
                  검색 초기화
                </button>
              </div>
            )}
          </div>
          <p className="preview-footnote">
            샘플 일기 3개 · 재생 시 합성 시험음이 들려요.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
