"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
export function AppShell({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState("blue");
  useEffect(() => {
    try {
      const p = localStorage.getItem("diary-palette");
      if (p && ["blue", "coral", "mint"].includes(p)) {
        setPalette(p);
        document.documentElement.dataset.palette = p;
      }
    } catch {}
  }, []);
  function choose(p: string) {
    setPalette(p);
    document.documentElement.dataset.palette = p;
    try {
      localStorage.setItem("diary-palette", p);
    } catch {}
  }
  return (
    <>
      <header className="site-header">
        <Link
          className="brand-lockup"
          href="/demo"
          aria-label="가족의 이야기 보관함"
        >
          <span className="brand-symbol">
            <Icon name="mic" />
          </span>
          <span>가족의 이야기</span>
        </Link>
        <div className="header-actions">
          <button className="sample-label" onClick={() => setSettings(true)}>
            샘플 미리보기
          </button>
          <button
            className="appbar-btn"
            aria-label="화면 설정"
            onClick={() => setSettings(true)}
          >
            <Icon name="settings" />
          </button>
        </div>
      </header>
      {children}
      {settings && (
        <Sheet title="화면 설정" onClose={() => setSettings(false)}>
          <p className="row-sub">마음에 드는 색으로 골라 보세요.</p>
          <div className="palette-options" role="group" aria-label="화면 색상">
            {[
              ["blue", "맑은 파랑"],
              ["coral", "따뜻한 코랄"],
              ["mint", "산뜻한 민트"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`palette-option palette-${id}`}
                aria-pressed={palette === id}
                onClick={() => choose(id)}
              >
                <span className="palette-dot" />
                {label}
                {palette === id && <Icon name="check" />}
              </button>
            ))}
          </div>
          <div className="sample-info">
            <h3 className="row-title">샘플로 둘러보는 중이에요</h3>
            <p>
              일기 3개와 합성 시험음으로 만든 화면이에요. 실제 가족의 녹음은
              저장하지 않아요.
            </p>
            <p>차량 녹음·AI 정리·기기 연결은 아직 준비 중이에요.</p>
          </div>
        </Sheet>
      )}
    </>
  );
}
