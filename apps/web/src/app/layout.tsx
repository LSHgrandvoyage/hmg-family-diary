import type { Metadata } from "next";
import "./styles.css";
export const metadata: Metadata = {
  title: "가족의 이야기",
  description: "함께한 날의 이야기와 목소리를 다시 만나는 가족 일기",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <a className="skip" href="#main">
          본문으로 이동
        </a>
        {children}
      </body>
    </html>
  );
}
