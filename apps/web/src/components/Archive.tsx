"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "./AppShell";
import { Icon } from "./Icon";
import { members, records, demoVehicles } from "../demo/records";
export default function Archive({
  initialVehicle = "all",
}: {
  initialVehicle?: string;
}) {
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState("all");
  const months = [...new Set(records.map((r) => r.date.slice(0, 7)))]
    .sort()
    .reverse();
  const monthLabel = (key: string) =>
    `${key.slice(0, 4)}년 ${Number(key.slice(5))}월`;
  const filtered = records.filter(
    (r) =>
      (month === "all" || r.date.startsWith(month)) &&
      (vehicle === "all" || r.context.vehicle?.id === vehicle) &&
      `${r.title} ${r.place} ${r.date} ${r.day} ${r.context.vehicle?.nickname ?? ""} ${r.context.vehicle?.model ?? ""}`.includes(
        query.trim(),
      ),
  );
  const recent =
    records.find(
      (r) => vehicle === "all" || r.context.vehicle?.id === vehicle,
    ) ?? records[0];
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
                {vehicle === "all" ? "최근 이야기" : "이 차의 최근 이야기"}
              </h2>
              <span className="row-sub">{recent.day}</span>
            </div>
            <Link
              className="recent-story"
              href={`/demo/${recent.id}`}
              data-anchor
            >
              <div className="story-art">
                <img src={`/design/${recent.art}.svg`} alt="" />
              </div>
              <div className="recent-copy">
                <p className="row-sub">{recent.place} · 가족 나들이</p>
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
          <div className="archive-filters">
            <label className="period-filter">
              기록 기간
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                aria-label="기록 기간"
              >
                <option value="all">전체 기간</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="period-filter">
              함께한 차
              <select
                aria-label="함께한 차"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              >
                <option value="all">모든 차의 추억</option>
                {demoVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nickname} · {v.model}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="result-count" role="status">
            {filtered.length}개의 이야기
          </p>
          <div className="month-groups">
            {months
              .filter((m) => filtered.some((r) => r.date.startsWith(m)))
              .map((m) => (
                <section
                  className="month-group"
                  key={m}
                  aria-label={monthLabel(m)}
                >
                  <h3 className="month-title">
                    {monthLabel(m)}{" "}
                    <span>
                      {filtered.filter((r) => r.date.startsWith(m)).length}개의
                      이야기
                    </span>
                  </h3>
                  <div className="block is-list story-list">
                    {filtered
                      .filter((r) => r.date.startsWith(m))
                      .map((r) => (
                        <Link
                          href={`/demo/${r.id}`}
                          className="row story-row"
                          key={r.id}
                        >
                          <span className="row-art">
                            <img src={`/design/${r.art}.svg`} alt="" />
                          </span>
                          <div className="row-main">
                            <p className="row-sub">{r.day}</p>
                            <h4 className="row-title">{r.title}</h4>
                            <p className="row-sub">{r.place} · 보호자, 아이</p>
                            <p className="record-car-label">
                              {r.context.vehicle?.nickname} ·{" "}
                              {r.context.vehicle?.model}
                            </p>
                          </div>
                          <span className="row-trail">
                            <Icon name="chevron" />
                          </span>
                        </Link>
                      ))}
                  </div>
                </section>
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
                    setMonth("all");
                    setVehicle("all");
                  }}
                >
                  검색 초기화
                </button>
              </div>
            )}
          </div>
          <p className="preview-footnote">
            샘플 일기 {records.length}개 · 재생 시 합성 시험음이 들려요.
          </p>
        </section>
      </main>
    </AppShell>
  );
}
