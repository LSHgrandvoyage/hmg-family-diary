"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
type Selection = { start: number; end: number; label: string };
const stamp = (n: number) => `0:${Math.floor(n).toString().padStart(2, "0")}`;
export function AudioPlayer({
  src,
  selection,
  onClose,
}: {
  src: string;
  selection: Selection;
  onClose: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(selection.start);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let url: string | undefined;
    const player = ref.current;
    setState("loading");
    setPlaying(false);
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
  async function toggle() {
    const player = ref.current;
    if (!player) return;
    if (!player.paused) {
      player.pause();
      return;
    }
    if (player.currentTime >= selection.end)
      player.currentTime = selection.start;
    try {
      await player.play();
    } catch {
      setState("error");
    }
  }
  return (
    <section className="player" aria-label="녹음 재생">
      <audio
        ref={ref}
        preload="metadata"
        aria-label={selection.label}
        onLoadedMetadata={() => {
          if (ref.current) {
            ref.current.currentTime = selection.start;
            setTime(selection.start);
            setState("ready");
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => {
          const player = ref.current;
          if (!player) return;
          if (player.currentTime >= selection.end) {
            player.pause();
            if (player.currentTime > selection.end)
              player.currentTime = selection.end;
          }
          setTime(Math.min(player.currentTime, selection.end));
        }}
        onError={() => setState("error")}
      />
      <div className="player-meta">
        <strong>{selection.label}</strong>
        <span>합성 시험음 · 8초</span>
      </div>
      <input
        className="player-range"
        type="range"
        aria-label="재생 위치"
        aria-valuetext={`${stamp(time)}, 선택 구간 ${stamp(selection.start)}부터 ${stamp(selection.end)}까지`}
        min={selection.start}
        max={selection.end}
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
        <span>{stamp(selection.end)}</span>
      </div>
      <div className="player-controls">
        <button
          className="btn tint"
          disabled={state !== "ready"}
          onClick={toggle}
        >
          <Icon name={playing ? "pause" : "play"} />
          {playing ? "일시 정지" : "재생"}
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
            : `${stamp(selection.start)}–${stamp(selection.end)} 구간을 들을 수 있어요.`}
      </p>
      {state === "error" && (
        <button className="btn tint" onClick={() => setAttempt((a) => a + 1)}>
          다시 시도
        </button>
      )}
      <small>실제 목소리가 아닌 재생 확인용 소리예요.</small>
    </section>
  );
}
