import type { SVGProps } from "react";
type Name =
  | "back"
  | "chevron"
  | "play"
  | "pause"
  | "search"
  | "close"
  | "settings"
  | "mic"
  | "volume"
  | "arrow"
  | "check"
  | "alert";
const paths: Record<Name, React.ReactNode> = {
  back: <path d="m14 6-6 6 6 6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  play: <path d="m9 5 11 7-11 7z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  close: <path d="m6 6 12 12M6 18 18 6" />,
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="16" cy="17" r="3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </>
  ),
  volume: (
    <>
      <path d="m3 9 4 0 5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  alert: (
    <>
      <path d="m12 3 10 18H2zM12 9v4M12 16v1" />
    </>
  ),
};
export function Icon({
  name,
  ...props
}: { name: Name } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
