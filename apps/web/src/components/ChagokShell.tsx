"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

export function ChagokShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const detail = path.startsWith("/library/");
  const login = path === "/login";
  const [account, setAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className={`chagok ${detail ? "chagok-detail" : ""}`}>
      {!detail && (
        <header className="chagok-header">
          <Link className="chagok-brand" href="/library">
            차곡
          </Link>
          <Link href="/devices" className="chagok-badge">
            <Icon name="car" />
            우리 차와 연결
          </Link>
        </header>
      )}
      {children}
      {!login && !detail && (
        <nav className="chagok-nav" aria-label="주 메뉴">
          <Link
            href="/library"
            aria-current={path === "/library" ? "page" : undefined}
          >
            <Icon name="book" />
            일기
          </Link>
          <Link
            href="/devices"
            aria-current={path === "/devices" ? "page" : undefined}
          >
            <Icon name="car" />
            차량
          </Link>
          <button onClick={() => setAccount(true)}>
            <Icon name="person" />
            계정
          </button>
        </nav>
      )}
      {account && (
        <Sheet title="우리 가족 보관함" onClose={() => setAccount(false)}>
          <p>
            이 계정에 연결된 차량과 휴대폰에서 같은 일기와 목소리를 볼 수
            있어요.
          </p>
          <Link
            className="btn secondary full"
            href="/devices"
            onClick={() => setAccount(false)}
          >
            연결 차량 관리
          </Link>
          {error && <p role="alert">{error}</p>}
          <button
            className="btn secondary full"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/auth/sign-out", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: "{}",
                });
                if (!r.ok) throw Error();
                location.assign("/login");
              } catch {
                setError("로그아웃하지 못했어요. 다시 시도해 주세요.");
                setBusy(false);
              }
            }}
          >
            로그아웃
          </button>
        </Sheet>
      )}
    </div>
  );
}
