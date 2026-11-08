"use client";
import { useEffect, useRef, useState } from "react";
import {
  addPhotos,
  listPhotos,
  removePhoto,
  preparePhoto,
  PHOTO_LIMIT,
  type SavedPhoto,
} from "../client/photos";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
export function PhotoGallery({ recordId }: { recordId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [previews, setPreviews] = useState<{ id: string; url: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setLoaded(false);
    setError("");
    void listPhotos(recordId)
      .then((result) => {
        if (live) {
          setPhotos(result);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [recordId, reload]);
  useEffect(() => {
    const urls = photos.map((photo) => ({
      id: photo.id,
      url: URL.createObjectURL(photo.blob),
    }));
    setPreviews(urls);
    return () => urls.forEach((photo) => URL.revokeObjectURL(photo.url));
  }, [photos]);
  async function upload(files: File[]) {
    if (!files.length) return;
    setError("");
    setMessage("");
    if (files.length + photos.length > PHOTO_LIMIT) {
      setError(`일기마다 사진을 ${PHOTO_LIMIT}장까지 보관할 수 있어요.`);
      return;
    }
    setBusy(true);
    try {
      const blobs: Blob[] = [];
      for (const file of files) blobs.push(await preparePhoto(file));
      await addPhotos(recordId, blobs);
      setPhotos(await listPhotos(recordId));
      setMessage(`${files.length}장의 사진을 이 브라우저에 저장했어요.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function erase(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await removePhoto(recordId, id);
      setPhotos(await listPhotos(recordId));
      setSelected(null);
      setMessage("일기에서 사진을 삭제했어요.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const opened = previews.find((photo) => photo.id === selected);
  return (
    <section className="photo-section" aria-label="일기 사진">
      <div className="block-head">
        <h2 className="h2">그날의 사진</h2>
        <span className="row-sub">
          {photos.length}/{PHOTO_LIMIT}
        </span>
      </div>
      <p className="row-sub">목소리 옆에, 함께 본 풍경도 남겨요.</p>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        aria-label="일기에 사진 추가"
        disabled={!loaded || busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void upload(files);
        }}
      />
      {previews.length > 0 ? (
        <div className="photo-grid">
          {previews.map((photo, i) => (
            <figure key={photo.id}>
              <button
                className="photo-open"
                aria-label={`사진 ${i + 1} 크게 보기`}
                onClick={() => setSelected(photo.id)}
              >
                <img src={photo.url} alt={`일기에 첨부한 사진 ${i + 1}`} />
              </button>
              <figcaption>
                <span>사진 {i + 1}</span>
                <button
                  className="photo-delete"
                  disabled={busy}
                  aria-label={`사진 ${i + 1} 삭제`}
                  onClick={() => void erase(photo.id)}
                >
                  <Icon name="close" />
                  삭제
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="photo-empty">
          {loaded ? "이 날의 사진을 추가해 보세요." : "사진을 불러오고 있어요."}
        </div>
      )}
      <button
        className="btn tint full"
        disabled={!loaded || busy || photos.length >= PHOTO_LIMIT}
        onClick={() => input.current?.click()}
      >
        {busy ? "사진을 저장하고 있어요…" : "사진 추가"}
      </button>
      {error && (
        <p className="photo-error" role="alert">
          {error}
        </p>
      )}
      {!loaded && error && (
        <button
          className="btn secondary full"
          onClick={() => setReload((n) => n + 1)}
        >
          사진 다시 불러오기
        </button>
      )}
      <p className="photo-status" role="status">
        {message}
      </p>
      <p className="preview-footnote">
        이 브라우저에만 저장돼요. 기기 간 공유는 아직 준비 중이에요.
        <br />
        JPG·PNG·WebP · 장당 10MB 이하 · 브라우저 데이터를 지우면 사진도
        삭제돼요.
      </p>
      {opened && (
        <Sheet title="그날의 사진" onClose={() => setSelected(null)}>
          <img
            className="photo-lightbox"
            src={opened.url}
            alt="선택한 일기 사진"
          />
        </Sheet>
      )}
    </section>
  );
}
