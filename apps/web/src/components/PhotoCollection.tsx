"use client";
import { useState } from "react";
import { Sheet } from "./Sheet";
import { ActionMenu } from "./ActionMenu";

type Photo = { id: string; url: string };
type Panel = "all" | "view" | "choose-delete" | "confirm-delete" | null;
export function PhotoCollection({
  photos,
  busy,
  onDelete,
  onAdd,
  deleteDescription,
}: {
  photos: Photo[];
  busy: boolean;
  onDelete: (id: string) => Promise<void>;
  onAdd: () => void;
  deleteDescription: string;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const opened = photos.find((p) => p.id === selected);
  function grid(items: Photo[], deleting = false) {
    return (
      <div className="photo-grid">
        {items.map((p) => {
          const index = photos.findIndex((item) => item.id === p.id) + 1;
          return (
            <button
              key={p.id}
              className="photo-open"
              disabled={busy || saving}
              aria-label={
                deleting ? `사진 ${index} 삭제 선택` : `사진 ${index} 크게 보기`
              }
              onClick={() => {
                setSelected(p.id);
                setError("");
                setPanel(deleting ? "confirm-delete" : "view");
              }}
            >
              <img
                src={p.url}
                alt={`일기에 첨부한 사진 ${index}`}
                loading="lazy"
              />
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <>
      <div className="photo-heading">
        <h2 className="h2">
          그날의 사진 <span className="row-sub">{photos.length}/8</span>
        </h2>
        <ActionMenu
          label="사진 옵션"
          disabled={busy || saving}
          actions={[
            {
              label: "사진 추가",
              disabled: photos.length >= 8,
              onSelect: onAdd,
            },
            {
              label: "사진 삭제",
              disabled: photos.length === 0,
              onSelect: () => {
                setPanel("choose-delete");
                setError("");
              },
            },
          ]}
        />
      </div>
      {grid(photos.slice(0, 4))}
      {photos.length > 4 && (
        <button
          className="btn secondary full"
          disabled={busy || saving}
          onClick={() => setPanel("all")}
        >
          사진 더보기 · 전체 {photos.length}장
        </button>
      )}
      {panel && (
        <Sheet
          title={
            panel === "choose-delete"
              ? "삭제할 사진 선택"
              : panel === "confirm-delete"
                ? "이 사진을 삭제할까요?"
                : "그날의 사진"
          }
          onClose={() => {
            if (!saving) {
              setPanel(null);
              setError("");
            }
          }}
        >
          {panel === "all" && grid(photos)}
          {panel === "choose-delete" && (
            <>
              <p>삭제할 사진을 선택해 주세요.</p>
              {grid(photos, true)}
            </>
          )}
          {(panel === "view" || panel === "confirm-delete") &&
            (opened ? (
              <img
                className="photo-full photo-lightbox"
                src={opened.url}
                alt="선택한 일기 사진"
              />
            ) : (
              <p>이 사진은 더 이상 보관함에 없어요.</p>
            ))}
          {panel === "confirm-delete" && opened && (
            <>
              <p>{deleteDescription}</p>
              {error && (
                <p role="alert" className="photo-error">
                  {error}
                </p>
              )}
              <div className="live-actions">
                <button
                  className="btn secondary"
                  disabled={saving}
                  onClick={() => setPanel("choose-delete")}
                >
                  취소
                </button>
                <button
                  className="btn primary"
                  disabled={busy || saving}
                  onClick={async () => {
                    setSaving(true);
                    setError("");
                    try {
                      await onDelete(opened.id);
                      setPanel(null);
                      setSelected(null);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "삭제하지 못했어요. 다시 시도해 주세요.",
                      );
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "삭제 중…" : "삭제"}
                </button>
              </div>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
