"use client";
import { useState } from "react";
import Link from "next/link";
import type { RecordingContext } from "../../../../packages/diary/src/recording-context";
import { Icon } from "./Icon";
export function RecordingContextCard({
  context,
}: {
  context: RecordingContext;
}) {
  const [showPlate, setShowPlate] = useState(false);
  const { vehicle, location } = context;
  const captured = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(context.capturedAt));
  return (
    <section
      className="block vehicle-memory"
      aria-label="그날의 차와 녹음 장소"
    >
      <div className="block-head">
        <h2 className="h2">그날 함께한 차</h2>
        <span className="row-sub">예시</span>
      </div>
      {vehicle ? (
        <>
          <div className="vehicle-identity">
            <img src="/design/car.svg" alt="" />
            <div>
              <h3 className="row-title">{vehicle.nickname}</h3>
              <p className="row-sub">
                {[vehicle.manufacturer, vehicle.model]
                  .filter(Boolean)
                  .join(" ") || "모델 미등록"}
              </p>
              <p className="row-sub">
                {[
                  vehicle.bodyType,
                  vehicle.modelYear ? `${vehicle.modelYear}년형` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <div className="vehicle-plate">
            <span className="row-sub">차 번호</span>
            <strong>
              {vehicle.registrationNumber
                ? showPlate
                  ? vehicle.registrationNumber
                  : `••• ${vehicle.registrationNumber.slice(-4)}`
                : "등록하지 않음"}
            </strong>
            {vehicle.registrationNumber && (
              <button
                className="plate-toggle"
                aria-expanded={showPlate}
                onClick={() => setShowPlate((p) => !p)}
              >
                {showPlate ? "번호 가리기" : "번호 보기"}
              </button>
            )}
          </div>
          <p className="context-note">차가 바뀌어도 이 날의 모습으로 남아요.</p>
          <Link
            className="vehicle-memory-link"
            href={`/demo?car=${encodeURIComponent(vehicle.id)}`}
          >
            이 차의 추억 모아보기
            <Icon name="arrow" />
          </Link>
        </>
      ) : (
        <p className="row-sub">차량 정보가 없는 기록이에요.</p>
      )}
      <div className="recording-place">
        <h3 className="row-title">녹음을 시작한 곳</h3>
        <p className="recording-place-name">
          {location.status === "available" ? location.label : "위치 확인 못함"}
        </p>
        <p className="row-sub">{captured} · 녹음 시작</p>
        <p className="context-note">
          {location.status === "available"
            ? "이야기 속 방문지와는 다를 수 있어요."
            : "당시 위치를 확인하지 못했어요. 일기와 목소리는 그대로 남아요."}
        </p>
      </div>
      <p className="preview-footnote">차량·번호·장소는 샘플 정보예요.</p>
    </section>
  );
}
