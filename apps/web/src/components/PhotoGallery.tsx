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
import { PhotoCollection } from "./PhotoCollection";
import { PhotoUploadAlert } from "./PhotoUploadAlert";
export function PhotoGallery({ recordId }: { recordId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<SavedPhoto[]>([]);
  const [previews, setPreviews] = useState<{ id: string; url: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
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
      setUploadError(`일기마다 사진을 ${PHOTO_LIMIT}장까지 보관할 수 있어요.`);
      return;
    }
    setBusy(true);
    setMessage("사진을 저장하고 있어요…");
    try {
      const blobs: Blob[] = [];
      for (const file of files) blobs.push(await preparePhoto(file));
      await addPhotos(recordId, blobs);
      setPhotos(await listPhotos(recordId));
      setMessage(`${files.length}장의 사진을 이 브라우저에 저장했어요.`);
    } catch (e) {
      setMessage("");
      setUploadError((e as Error).message);
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
      setMessage("일기에서 사진을 삭제했어요.");
    } catch (e) {
      throw e;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="photo-section" aria-label="일기 사진">
      <PhotoCollection
        photos={previews}
        busy={busy || !loaded}
        onDelete={erase}
        onAdd={() => input.current?.click()}
        deleteDescription="이 브라우저에 보관한 사진을 일기에서 삭제해요."
      />
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
      {previews.length === 0 && (
        <div className="photo-empty">
          {loaded ? "이 날의 사진을 추가해 보세요." : "사진을 불러오고 있어요."}
        </div>
      )}
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
        이 브라우저에만 저장돼요. 기기 간 공유는 아직 준비 중이에요. 브라우저
        데이터를 지우면 사진도 삭제돼요.
      </p>
      {uploadError && (
        <PhotoUploadAlert
          message={uploadError}
          onClose={() => setUploadError("")}
        />
      )}
    </section>
  );
}
