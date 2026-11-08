import Link from "next/link";
import { findNearbyMemories } from "../../../../packages/diary/src/nearby-memories";
import { records, type DiaryRecord } from "../demo/records";
import { Icon } from "./Icon";
export function RevisitMemories({ record }: { record: DiaryRecord }) {
  // Preview only: same synthetic family. Production caller must verify vault access and parked state.
  const matches = findNearbyMemories<DiaryRecord>(record, records, true);
  const location = record.context.location;
  const hasPoint =
    location.status === "available" &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude);
  return (
    <section
      className="block revisit-section"
      aria-label="이곳 근처의 예전 기억"
    >
      <div className="revisit-heading">
        <span className="revisit-symbol">
          <Icon name="volume" />
        </span>
        <h2 className="h2">
          다시 온 곳,
          <br />
          그때의 목소리
        </h2>
      </div>
      <p className="row-sub">녹음을 시작한 곳 근처에 남긴 기억이에요.</p>
      {matches.length ? (
        matches.map(({ record: past, distanceMeters }) => (
          <div className="revisit-memory" key={past.id}>
            <p className="row-sub">
              {past.date.replaceAll("-", ".")} · 약{" "}
              {Math.max(10, Math.round(distanceMeters / 10) * 10)}m 근처
            </p>
            <h3 className="row-title">{past.title}</h3>
            <p className="revisit-car">
              {past.context.vehicle?.nickname} · {past.context.vehicle?.model}
            </p>
            <blockquote>“{past.memories[1].source}”</blockquote>
            <Link className="btn tint full" href={`/demo/${past.id}?listen=1`}>
              <Icon name="play" />
              그때 목소리 듣기
            </Link>
          </div>
        ))
      ) : (
        <p className="revisit-empty">
          {hasPoint
            ? "이 근처에 남긴 예전 기록은 아직 없어요."
            : "녹음 위치가 없어 근처의 기억을 찾을 수 없어요."}
        </p>
      )}
      <p className="preview-footnote">
        샘플 위치 기준 · 300m 이내 과거 기록
        <br />
        선택하면 일기와 전체 녹음이 열려요.
      </p>
    </section>
  );
}
