"use client";
import Link from "next/link";
import { useEffect, useState, useRef, type FormEvent } from "react";
import type { SyncedMemory } from "../../../../packages/sync/src/snapshot";
import type { DiaryOutput } from "../../../../packages/contracts/src/diary";
import { AudioPlayer } from "./AudioPlayer";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
const messages: Record<string, string> = {
  LOGIN_REQUIRED: "로그인 후 다시 열어 주세요.",
  REVISION_CONFLICT:
    "다른 기기에서 변경됐어요. 새로고침 후 다시 시도해 주세요.",
  VEHICLE_ALREADY_CONNECTED:
    "이미 연결한 차량이 있어요. 먼저 연결을 해제해 주세요.",
  PHOTO_LIMIT: "사진은 일기마다 8장까지 첨부할 수 있어요.",
  INVALID_PHOTO:
    "JPG·PNG·WebP 사진을 선택해 주세요. 한 장에 10MB까지 가능해요.",
  TOO_LARGE: "파일이 너무 커요. 사진은 10MB 이하로 선택해 주세요.",
  RATE_LIMITED: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
};
async function call(
  path: string,
  method = "GET",
  data?: unknown,
  headers?: Record<string, string>,
) {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      ...(data instanceof File ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body:
      data === undefined
        ? undefined
        : data instanceof File
          ? data
          : JSON.stringify(data),
  });
  const b = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path.startsWith("/api/v1")) {
      location.assign("/login");
    }
    throw Error(
      messages[b.error?.code] ??
        b.message ??
        "처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.",
    );
  }
  return b;
}
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-header">
        <Link className="brand-lockup" href="/library">
          <span className="brand-symbol">
            <Icon name="mic" />
          </span>
          가족의 이야기
        </Link>
        <nav className="live-nav" aria-label="주 메뉴">
          <Link href="/devices">차량 연결</Link>
          <button
            onClick={async () => {
              try {
                await call("/api/auth/sign-out", "POST", {});
                location.assign("/login");
              } catch {
                alert("로그아웃하지 못했어요. 다시 시도해 주세요.");
              }
            }}
          >
            로그아웃
          </button>
        </nav>
      </header>
      {children}
    </>
  );
}
export function Login() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(
      "login",
    ),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("token")) setMode("reset");
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      email = String(f.get("email")),
      password = String(f.get("password"));
    setBusy(true);
    setNotice("");
    try {
      if (mode === "signup") {
        await call("/api/auth/sign-up/email", "POST", {
          email,
          password,
          name: String(f.get("name")),
          callbackURL: "/login",
        });
        setNotice("확인 메일을 보냈어요. 메일의 링크를 연 뒤 로그인해 주세요.");
      } else if (mode === "forgot") {
        await call("/api/auth/request-password-reset", "POST", {
          email,
          redirectTo: "/login",
        });
        setNotice("가입된 이메일이라면 재설정 링크가 도착해요.");
      } else if (mode === "reset") {
        await call("/api/auth/reset-password", "POST", {
          newPassword: password,
          token: new URLSearchParams(location.search).get("token"),
        });
        history.replaceState(null, "", "/login");
        setMode("login");
        setNotice("비밀번호를 바꿨어요. 다시 로그인해 주세요.");
      } else {
        await call("/api/auth/sign-in/email", "POST", { email, password });
        location.assign("/library");
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" className="login-layout">
      <section className="hero">
        <p className="eyebrow">가족의 이야기</p>
        <h1 className="title">
          함께한 길을,
          <br />
          우리의 목소리로.
        </h1>
        <p className="lead">
          차 안에서 남긴 이야기와 사진을
          <br />
          언제든 다시 읽고 들어 보세요.
        </p>
        <img className="login-art" src="/design/car.svg" alt="" />
      </section>
      <section className="block login-card">
        <h2 className="h2">
          {mode === "signup"
            ? "가족 보관함 만들기"
            : mode === "forgot"
              ? "비밀번호 찾기"
              : mode === "reset"
                ? "새 비밀번호"
                : "우리 보관함 열기"}
        </h2>
        <form className="live-form" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              보호자 이름
              <input name="name" autoComplete="name" maxLength={40} required />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              이메일
              <input name="email" type="email" autoComplete="email" required />
            </label>
          )}
          {mode !== "forgot" && (
            <label>
              비밀번호
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={12}
                required
              />
              <small>12자 이상으로 입력해 주세요.</small>
            </label>
          )}
          <button className="btn primary full" disabled={busy}>
            {busy
              ? "처리하고 있어요…"
              : mode === "signup"
                ? "보관함 만들기"
                : mode === "forgot"
                  ? "재설정 메일 받기"
                  : mode === "reset"
                    ? "비밀번호 바꾸기"
                    : "로그인"}
          </button>
          <p role="status" className="live-notice">
            {notice}
          </p>
        </form>
        <div className="live-actions">
          {mode !== "login" && (
            <button
              className="btn secondary"
              onClick={() => {
                setMode("login");
                setNotice("");
              }}
            >
              로그인으로
            </button>
          )}
          {mode === "login" && (
            <>
              <button
                className="btn secondary"
                onClick={() => setMode("signup")}
              >
                처음이신가요?
              </button>
              <button
                className="btn secondary"
                onClick={() => setMode("forgot")}
              >
                비밀번호 찾기
              </button>
            </>
          )}
        </div>
        <p className="context-note">
          개발 시험용 보관함이에요. 확인 메일은 개발자의 로컬 메일함으로
          전달돼요. 현재 AI 정리는 목업이에요.
        </p>
        <Link className="back-link" href="/demo">
          샘플 먼저 둘러보기 →
        </Link>
      </section>
    </main>
  );
}
export function LiveApp({
  id,
  devices = false,
}: {
  id?: string;
  devices?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<SyncedMemory[]>([]),
    [record, setRecord] = useState<SyncedMemory | null>(null),
    [list, setList] = useState<
      {
        id: string;
        label: string;
        expires_at: string;
        revoked_at: string | null;
      }[]
    >([]),
    [code, setCode] = useState<{ code: string; expires_at: string } | null>(
      null,
    );
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [playing, setPlaying] = useState(false),
    [photo, setPhoto] = useState<string | null>(null),
    [remove, setRemove] = useState(false),
    [tab, setTab] = useState("diary");
  async function refresh() {
    try {
      if (devices) setList((await call("/api/v1/devices")).devices);
      else if (id) setRecord(await call(`/api/v1/sessions/${id}`));
      else setItems((await call("/api/v1/sessions")).items);
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setPlaying(false);
      setPhoto(null);
      setRecord(null);
      setNotice((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    const timer = setInterval(focus, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [id, devices]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const draft = record
    ? (JSON.parse(record.snapshot.draft) as DiaryOutput)
    : null;
  const filtered = items.filter((m) =>
    JSON.stringify([m.snapshot.text, m.snapshot.context?.vehicle])
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Shell>
      <main id="main" className="detail-layout live-layout">
        <div className="detail-nav">
          <Link href="/library" className="back-link">
            ← 우리 보관함
          </Link>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            새로고침
          </button>
        </div>
        <p className="live-notice" role="status">
          {loading ? "보관함을 불러오고 있어요…" : notice}
        </p>
        {devices ? (
          <section className="block live-stack">
            <p className="eyebrow">우리 차와 연결</p>
            <h1 className="title">추억이 이어지는 자리</h1>
            <p className="lead">
              차량에서 코드를 입력하면 같은 가족 보관함을 열 수 있어요. 연결
              후에도 직접 선택한 기록만 전송해요.
            </p>
            <button
              className="btn primary"
              disabled={
                busy ||
                list.some(
                  (x) => !x.revoked_at && Date.parse(x.expires_at) > Date.now(),
                )
              }
              onClick={() =>
                act(async () =>
                  setCode(await call("/api/v1/pairings", "POST", {})),
                )
              }
            >
              차량 연결 코드 만들기
            </button>
            {code && (
              <div className="pair-code">
                <strong>{code.code}</strong>
                <p>
                  {new Date(code.expires_at).toLocaleTimeString("ko-KR")}까지 ·
                  한 번만 사용 가능
                </p>
              </div>
            )}
            {list.map((x) => (
              <div className="live-device" key={x.id}>
                <div>
                  <h2 className="h2">{x.label}</h2>
                  <p className="row-sub">
                    {x.revoked_at
                      ? "연결 해제됨"
                      : Date.parse(x.expires_at) < Date.now()
                        ? "연결 만료됨"
                        : `연결됨 · ${new Date(x.expires_at).toLocaleDateString("ko-KR")}까지`}
                  </p>
                </div>
                {!x.revoked_at && (
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await call(`/api/v1/devices/${x.id}`, "DELETE");
                        setCode(null);
                        setNotice(
                          "연결을 해제했어요. 차량이 다시 접속하면 공유 사본을 삭제해요.",
                        );
                        await refresh();
                      })
                    }
                  >
                    연결 해제
                  </button>
                )}
              </div>
            ))}
            <p className="context-note">
              공유된 음성과 글·사진은 가족 보관함에 함께 저장돼요. 오프라인
              차량의 삭제는 다음 연결 때 반영돼요.
            </p>
          </section>
        ) : id ? (
          record && draft ? (
            <div className="detail-columns">
              <article className="detail-paper">
                <p className="eyebrow">
                  {new Date(record.snapshot.recorded_at).toLocaleDateString(
                    "ko-KR",
                  )}{" "}
                  · {record.snapshot.speaker}
                </p>
                <h1 className="title">
                  {draft.groups[0]?.label ?? "우리의 이야기"}
                </h1>
                <p className="diary-context-summary">
                  확인문으로 만든 목업 일기 · 원본 음성{" "}
                  {record.audio_ready ? "동기화됨" : "전송 대기"}
                </p>
                <div
                  className="live-actions reading-tabs"
                  role="group"
                  aria-label="일기 보기"
                >
                  <button
                    className="btn secondary"
                    aria-pressed={tab === "diary"}
                    onClick={() => setTab("diary")}
                  >
                    일기 읽기
                  </button>
                  <button
                    className="btn secondary"
                    aria-pressed={tab === "source"}
                    onClick={() => setTab("source")}
                  >
                    원래 이야기
                  </button>
                </div>
                {tab === "diary" ? (
                  <div className="diary-body">
                    {draft.groups.map((g) => (
                      <section className="live-group" key={g.id}>
                        {draft.groups.length > 1 && (
                          <h2 className="h2">{g.label}</h2>
                        )}
                        {g.statements.map((s, i) => (
                          <p key={i}>{s.text}</p>
                        ))}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="diary-body">
                    <h2 className="h2">확인한 이야기</h2>
                    <p>{record.snapshot.text}</p>
                    <details>
                      <summary>처음 인식한 내용</summary>
                      {record.snapshot.raw_history.map((t, i) => (
                        <p key={i}>{t}</p>
                      ))}
                    </details>
                  </div>
                )}
                <section className="photo-section">
                  <h2 className="h2">
                    그날의 사진{" "}
                    <span className="row-sub">{record.photos.length}/8</span>
                  </h2>
                  <div className="photo-grid">
                    {record.photos.map((p, i) => (
                      <div key={p.id}>
                        <button
                          className="photo-open"
                          onClick={() => setPhoto(p.id)}
                          aria-label={`사진 ${i + 1} 크게 보기`}
                        >
                          <img
                            src={`/api/v1/sessions/${id}/photos/${p.id}`}
                            alt={`그날 첨부한 사진 ${i + 1}`}
                            loading="lazy"
                          />
                        </button>
                        <button
                          className="btn secondary full"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                "이 사진을 가족 보관함과 연결한 차량에서 삭제할까요?",
                              )
                            )
                              void act(async () => {
                                setRecord(
                                  await call(
                                    `/api/v1/sessions/${id}/photos/${p.id}`,
                                    "DELETE",
                                  ),
                                );
                              });
                          }}
                        >
                          사진 삭제
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn tint full"
                    disabled={busy || record.photos.length >= 8}
                    onClick={() => fileInput.current?.click()}
                  >
                    {busy ? "사진을 저장하고 있어요…" : "사진 추가하기"}
                  </button>
                  <label className="visually-hidden">
                    사진 첨부
                    <input
                      type="file"
                      ref={fileInput}
                      tabIndex={-1}
                      accept="image/jpeg,image/png,image/webp"
                      disabled={busy || record.photos.length >= 8}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f)
                          void act(async () => {
                            if (f.size > 10 * 1024 * 1024)
                              throw Error(messages.TOO_LARGE);
                            setRecord(
                              await call(
                                `/api/v1/sessions/${id}/photos`,
                                "POST",
                                f,
                                { "idempotency-key": crypto.randomUUID() },
                              ),
                            );
                            setNotice(
                              "사진을 저장했어요. 차량에서 동기화하면 함께 볼 수 있어요.",
                            );
                          });
                      }}
                    />
                  </label>
                  <p className="context-note">
                    JPG·PNG·WebP · 한 장에 10MB까지. iPhone 사진이 HEIC라면
                    JPEG로 변환해 주세요.
                  </p>
                </section>
              </article>
              <aside className="memory-panel">
                <button
                  className="whole-recording"
                  disabled={!record.audio_ready}
                  onClick={() => setPlaying(true)}
                >
                  <span>
                    <strong>그날의 목소리 듣기</strong>
                    <small>전체 녹음 · 구간을 눌러 이어 듣기</small>
                  </span>
                  <Icon name="play" />
                </button>
                <section className="block live-stack">
                  <h2 className="h2">기록했던 우리 차</h2>
                  <p>
                    {record.snapshot.context
                      ? ["nickname", "brand", "model", "type", "year", "plate"]
                          .map((key) => record.snapshot.context!.vehicle[key])
                          .filter(Boolean)
                          .join(" · ")
                      : "차량 정보 없음"}
                  </p>
                  <p className="context-note">
                    {record.snapshot.context?.vehicle.source === "synthetic"
                      ? "샘플 차량 정보"
                      : "기록 당시 직접 입력한 정보"}
                  </p>
                  <p className="context-note">
                    녹음 시작 위치:{" "}
                    {record.snapshot.context?.location.label ?? "수집하지 않음"}
                    {record.snapshot.context?.location.status === "synthetic"
                      ? " (샘플 위치)"
                      : ""}
                  </p>
                </section>
                <a
                  className="btn secondary"
                  href={`/api/v1/sessions/${id}/audio`}
                  download="family-memory.wav"
                >
                  원본 녹음 내려받기
                </a>
                <button
                  className="btn secondary"
                  onClick={() => setRemove(true)}
                >
                  일기와 원본 삭제
                </button>
                <p className="context-note">
                  휴대폰에서도 운전 중 조작하지 마세요. 차량에서 주차 후 사용해
                  주세요.
                </p>
              </aside>
            </div>
          ) : (
            !loading && (
              <section className="block empty">
                <h1 className="h2">기록을 열 수 없어요</h1>
                <Link href="/library" className="btn primary">
                  보관함으로
                </Link>
              </section>
            )
          )
        ) : (
          <div className="archive-layout live-archive">
            <section className="archive-primary">
              <div className="hero">
                <p className="eyebrow">우리 가족 보관함</p>
                <h1 className="title">
                  지나온 길마다,
                  <br />
                  다시 꺼낼 이야기.
                </h1>
                <p className="lead">
                  우리 차에서 나눈 이야기를
                  <br />
                  목소리 그대로 간직해요.
                </p>
              </div>
              <section className="block live-stack">
                <h2 className="h2">새로운 추억은 차 안에서</h2>
                <p className="row-sub">
                  차량 앱에서 일기를 저장한 뒤 ‘휴대폰에 공유’를 눌러 주세요.
                </p>
                <Link className="btn tint" href="/devices">
                  차량 연결 관리 →
                </Link>
              </section>
            </section>
            <section className="archive-list">
              <div className="list-heading">
                <h2 className="h2">
                  모아 둔 이야기 <span>{items.length}</span>
                </h2>
              </div>
              <label className="search">
                <span className="visually-hidden">이야기와 차량 검색</span>
                <Icon name="search" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="이야기나 차량 이름으로 찾아보세요"
                />
              </label>
              <div className="block story-list">
                {filtered.map((m) => (
                  <Link
                    className="story-row row"
                    href={`/library/${m.id}`}
                    key={m.id}
                  >
                    <span className="row-main">
                      <strong className="row-title">
                        {(JSON.parse(m.snapshot.draft) as DiaryOutput).groups[0]
                          ?.label ?? "우리의 이야기"}
                      </strong>
                      <span className="row-sub">
                        {new Date(m.snapshot.recorded_at).toLocaleDateString(
                          "ko-KR",
                        )}{" "}
                        · {m.snapshot.speaker}
                      </span>
                      <span className="record-car-label">
                        {m.snapshot.context?.vehicle.nickname ||
                          m.snapshot.context?.vehicle.model ||
                          "차량 정보 없음"}{" "}
                        · {m.audio_ready ? "목소리 보관됨" : "원본 전송 대기"}
                      </span>
                    </span>
                    <Icon name="chevron" />
                  </Link>
                ))}
                {!loading && !filtered.length && (
                  <div className="empty">
                    <h3 className="row-title">
                      {query
                        ? "찾는 이야기가 없어요"
                        : "첫 이야기를 기다리고 있어요"}
                    </h3>
                    <p className="row-sub">
                      {query
                        ? "다른 단어로 찾아보세요."
                        : "차량에서 공유한 기록이 여기에 모여요."}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
        {playing && record && (
          <Sheet title="원래 이야기" onClose={() => setPlaying(false)}>
            <AudioPlayer
              src={`/api/v1/sessions/${id}/audio`}
              synthetic={false}
              segments={[
                {
                  id: "original",
                  start: 0,
                  end: record.snapshot.duration_ms / 1000,
                  name: record.snapshot.speaker,
                  avatar: "/design/avatars/20.png",
                  source: record.snapshot.text,
                },
              ]}
              request={null}
              onClose={() => setPlaying(false)}
            />
            <p className="context-note">
              현재 녹음 전체를 한 구간으로 연결해요. 세부 발화 시각은 아직 검증
              전이에요.
            </p>
          </Sheet>
        )}
        {photo && (
          <Sheet title="그날의 사진" onClose={() => setPhoto(null)}>
            <img
              className="photo-full"
              src={`/api/v1/sessions/${id}/photos/${photo}`}
              alt="크게 보는 첨부 사진"
            />
          </Sheet>
        )}
        {remove && record && (
          <Sheet title="이 추억을 삭제할까요?" onClose={() => setRemove(false)}>
            <p>
              글·원본 녹음·사진을 함께 삭제해요. 연결된 차량의 사본은 다음
              동기화 때 삭제돼요.
            </p>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await call(`/api/v1/sessions/${id}`, "DELETE", {
                    expected_revision: record.revision,
                  });
                  location.assign("/library");
                })
              }
            >
              일기와 원본 함께 삭제
            </button>
            <button className="btn secondary" onClick={() => setRemove(false)}>
              남겨 두기
            </button>
          </Sheet>
        )}
      </main>
    </Shell>
  );
}
