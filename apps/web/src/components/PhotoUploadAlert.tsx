"use client";
import { Sheet } from "./Sheet";

export function PhotoUploadAlert({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <Sheet title="사진을 추가하지 못했어요" onClose={onClose}>
      <p role="alert">{message}</p>
      <button className="btn primary full" onClick={onClose}>
        확인
      </button>
    </Sheet>
  );
}
