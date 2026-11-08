"use client";
import { useEffect, useRef, useState } from "react";
type Selection = { start: number; end: number; label: string };
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
  const urlRef = useRef<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const player = ref.current;
    setState("loading");
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
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        if (ref.current) {
          ref.current.src = url;
          ref.current.load();
        }
        setState("ready");
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
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [src, attempt]);
  useEffect(() => {
    const p = ref.current;
    if (p) {
      p.pause();
      if (p.readyState >= 1) p.currentTime = selection.start;
    }
  }, [selection]);
  return (
    <section className="player" aria-label="녹음 재생">
      <div className="player-title">
        <div>
          <span className="eyebrow">그날의 소리</span>
          <h3>{selection.label}</h3>
        </div>
        <button className="text-button" onClick={onClose}>
          재생 종료
        </button>
      </div>
      <audio
        ref={ref}
        controls
        preload="metadata"
        aria-label={selection.label}
        onLoadedMetadata={() => {
          if (ref.current) ref.current.currentTime = selection.start;
        }}
        onTimeUpdate={() => {
          const p = ref.current;
          if (p && p.currentTime >= selection.end) {
            p.pause();
            p.currentTime = selection.start;
          }
        }}
        onError={() => setState("error")}
      />
      <p role="status">
        {state === "loading"
          ? "소리를 불러오고 있어요."
          : state === "error"
            ? "소리를 불러오지 못했어요. 다시 시도해 주세요."
            : "재생 버튼을 누르면 선택한 구간부터 들을 수 있어요."}
      </p>
      {state === "error" && (
        <button onClick={() => setAttempt((a) => a + 1)}>다시 시도</button>
      )}
      <small>
        개발 시연: 사람 목소리를 녹음한 파일이 아닌 합성 시험음입니다.
      </small>
    </section>
  );
}
