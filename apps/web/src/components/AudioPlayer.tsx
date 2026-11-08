"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
export type AudioSegment = {
  id: string;
  start: number;
  end: number;
  name: string;
  avatar: string;
  source: string;
};
export type PlaybackRequest = { position: number; id: number };
export const stamp = (n: number) =>
  `${Math.floor(n / 60)}:${Math.floor(n % 60)
    .toString()
    .padStart(2, "0")}`;
export function AudioPlayer({
  src,
  segments,
  request,
  onClose,
}: {
  src: string;
  segments: AudioSegment[];
  request: PlaybackRequest | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const appliedRequest = useRef<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let url: string | undefined;
    const player = ref.current;
    setState("loading");
    setPlaying(false);
    setNotice("");
    setTime(0);
    setDuration(0);
    appliedRequest.current = null;
    void (async () => {
      try {
        const response = await fetch(src, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("MEDIA_UNAVAILABLE");
        const blob = await response.blob();
        if (disposed) return;
        url = URL.createObjectURL(blob);
        if (player) {
          player.src = url;
          player.load();
        }
      } catch (error) {
        if (!disposed && (error as Error).name !== "AbortError")
          setState("error");
      }
    })();
    return () => {
      disposed = true;
      controller.abort();
      player?.pause();
      player?.removeAttribute("src");
      player?.load();
      if (url) URL.revokeObjectURL(url);
    };
  }, [src, attempt]);
  // External memory links land in the same full recording. Browsers may require another tap after loading.
  useEffect(() => {
    if (state !== "ready" || !request || appliedRequest.current === request.id)
      return;
    const player = ref.current;
    if (!player) return;
    appliedRequest.current = request.id;
    player.currentTime = Math.min(request.position, duration);
    setTime(player.currentTime);
    let cancelled = false;
    void player.play().catch(() => {
      if (!cancelled) setNotice("재생 버튼을 눌러 이어 들어 주세요.");
    });
    return () => {
      cancelled = true;
    };
  }, [request, state, duration]);
  function playFrom(position: number) {
    const player = ref.current;
    if (!player || state !== "ready") return;
    player.currentTime = Math.max(0, Math.min(position, duration));
    setTime(player.currentTime);
    setNotice("");
    void player
      .play()
      .catch(() => setNotice("재생 버튼을 눌러 이어 들어 주세요."));
  }
  function toggle() {
    const player = ref.current;
    if (!player) return;
    if (!player.paused) player.pause();
    else
      playFrom(
        player.ended || player.currentTime >= duration ? 0 : player.currentTime,
      );
  }
  const active = segments.find(
    (segment) => time >= segment.start && time < segment.end,
  );
  return (
    <section className="player recording-player" aria-label="전체 녹음과 원문">
      <audio
        ref={ref}
        preload="metadata"
        aria-label="전체 녹음"
        onLoadedMetadata={() => {
          const player = ref.current;
          if (
            player &&
            Number.isFinite(player.duration) &&
            player.duration > 0
          ) {
            setDuration(player.duration);
            setState("ready");
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setTime(duration);
        }}
        onTimeUpdate={() => {
          if (ref.current) setTime(ref.current.currentTime);
        }}
        onError={() => setState("error")}
      />
      <div className="recording-controls">
        <div className="player-meta">
          <h2 className="h2">전체 녹음</h2>
          <span>합성 시험음{duration > 0 ? ` · ${stamp(duration)}` : ""}</span>
        </div>
        <input
          className="player-range"
          type="range"
          aria-label="전체 녹음 재생 위치"
          aria-valuetext={`${stamp(time)} / ${stamp(duration)}`}
          min={0}
          max={duration || 1}
          step="0.1"
          value={time}
          disabled={state !== "ready"}
          onChange={(e) => {
            const value = Number(e.target.value);
            if (ref.current) ref.current.currentTime = value;
            setTime(value);
          }}
        />
        <div className="player-times">
          <span>{stamp(time)}</span>
          <span>{stamp(duration)}</span>
        </div>
        <div className="player-controls">
          <button
            className="btn tint"
            disabled={state !== "ready"}
            onClick={toggle}
          >
            <Icon name={playing ? "pause" : "play"} />
            {playing
              ? "일시 정지"
              : time >= duration && duration > 0
                ? "다시 재생"
                : "재생"}
          </button>
          <button className="btn secondary" onClick={onClose}>
            재생 종료
          </button>
        </div>
        <p className="player-status" role="status">
          {state === "loading"
            ? "소리를 불러오고 있어요."
            : state === "error"
              ? "소리를 불러오지 못했어요. 다시 시도해 주세요."
              : notice || "구간을 누르면 그 시점부터 끝까지 이어 들어요."}
        </p>
        {state === "error" && (
          <button
            className="btn tint full"
            onClick={() => setAttempt((a) => a + 1)}
          >
            다시 시도
          </button>
        )}
      </div>
      <div className="timeline-heading">
        <h3 className="row-title">시간순 이야기</h3>
        <span className="row-sub">{segments.length}개 구간</span>
      </div>
      <ol className="recording-timeline" aria-label="녹음 구간">
        {segments.map((segment) => (
          <li key={segment.id}>
            <button
              className={`timeline-segment ${active?.id === segment.id ? "is-current" : ""}`}
              aria-current={active?.id === segment.id ? "true" : undefined}
              aria-label={`${segment.name} ${stamp(segment.start)}부터 재생`}
              disabled={state !== "ready"}
              onClick={() => playFrom(segment.start)}
            >
              <span className="timeline-time">
                {stamp(segment.start)}
                <Icon name="play" />
              </span>
              <span className="timeline-content">
                <span className="timeline-speaker">
                  <span className="avatar">
                    <img src={segment.avatar} alt="" />
                  </span>
                  <strong>{segment.name}</strong>
                  {active?.id === segment.id && (
                    <span className="current-segment">현재 구간</span>
                  )}
                </span>
                <span className="timeline-quote">{segment.source}</span>
                <span className="timeline-end">
                  {stamp(segment.start)}–{stamp(segment.end)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="preview-footnote">
        원문은 인식문 예시이고, 소리는 실제 목소리가 아닌 합성 시험음이에요.
      </p>
    </section>
  );
}
