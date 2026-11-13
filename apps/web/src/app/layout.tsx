import type { Metadata } from "next";
import "./styles.css";
import "./chagok.css";
import "./appearance.css";
export const metadata: Metadata = {
  title: "차곡차곡",
  icons: { icon: "/faithful/brand/chagok-logo.svg" },
  description: "함께한 날의 이야기와 목소리를 다시 만나는 가족 일기",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script src="/faithful/theme.js" />
        <link rel="stylesheet" href="/faithful/theme.css" />
      </head>
      <body>
        <a className="skip" href="#main">
          본문으로 이동
        </a>
        {children}
      </body>
    </html>
  );
}
