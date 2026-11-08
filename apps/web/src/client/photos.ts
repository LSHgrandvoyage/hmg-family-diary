export const PHOTO_LIMIT = 8;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export type SavedPhoto = {
  id: string;
  recordId: string;
  blob: Blob;
  createdAt: number;
};
const DB_NAME = "family-diary-preview-photos";
function openPhotos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const request = indexedDB.open(DB_NAME, 1);
    const timer = setTimeout(() => {
      expired = true;
      reject(
        new Error(
          "사진 보관함을 열지 못했어요. 다른 탭을 닫고 다시 시도해 주세요.",
        ),
      );
    }, 5000);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("photos", {
        keyPath: "id",
      });
      store.createIndex("recordId", "recordId");
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) {
        request.result.close();
        return;
      }
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(
        new Error(
          "이 브라우저에서 사진 보관함을 열 수 없어요. 저장 공간 설정을 확인해 주세요.",
        ),
      );
    };
  });
}
export async function listPhotos(recordId: string): Promise<SavedPhoto[]> {
  const db = await openPhotos();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const req = tx.objectStore("photos").index("recordId").getAll(recordId);
    let result: SavedPhoto[] = [];
    req.onsuccess = () => {
      result = req.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result.sort((a, b) => a.createdAt - b.createdAt));
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("저장된 사진을 불러오지 못했어요. 다시 시도해 주세요."));
    };
  });
}
export async function addPhotos(
  recordId: string,
  blobs: Blob[],
): Promise<void> {
  const db = await openPhotos();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    const store = tx.objectStore("photos");
    let message =
      "사진을 저장하지 못했어요. 브라우저 저장 공간을 확인하고 다시 시도해 주세요.";
    const count = store.index("recordId").count(recordId);
    count.onsuccess = () => {
      if (count.result + blobs.length > PHOTO_LIMIT) {
        message = `일기마다 사진을 ${PHOTO_LIMIT}장까지 보관할 수 있어요.`;
        tx.abort();
        return;
      }
      blobs.forEach((blob, index) => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        const id = Array.from(bytes, (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        store.add({
          id,
          recordId,
          blob,
          createdAt: Date.now() + index,
        } satisfies SavedPhoto);
      });
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error(message));
    };
  });
}
export async function removePhoto(recordId: string, id: string): Promise<void> {
  const db = await openPhotos();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    const store = tx.objectStore("photos");
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result?.recordId === recordId) store.delete(id);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("사진을 삭제하지 못했어요. 다시 시도해 주세요."));
    };
  });
}
/** Decode local raster input and save a resized JPEG copy, without original EXIF data. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES)
    throw new Error("사진 한 장의 크기는 10MB 이하여야 해요.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!png && !jpeg && !webp)
    throw new Error(
      "JPG·PNG·WebP 사진을 골라 주세요. HEIC 사진은 JPG로 변환한 뒤 추가할 수 있어요.",
    );
  const url = URL.createObjectURL(file);
  const picture = new Image();
  try {
    picture.src = url;
    try {
      await picture.decode();
    } catch {
      throw new Error("읽을 수 없는 사진이에요. 다른 파일을 골라 주세요.");
    }
    if (
      !picture.naturalWidth ||
      !picture.naturalHeight ||
      picture.naturalWidth * picture.naturalHeight > 50_000_000
    )
      throw new Error(
        "사진 해상도가 너무 커요. 5천만 화소 이하의 사진을 골라 주세요.",
      );
    const scale = Math.min(
      1,
      2048 / Math.max(picture.naturalWidth, picture.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("사진을 준비하지 못했어요. 다시 시도해 주세요.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    canvas.width = canvas.height = 1;
    if (!blob || blob.size > PHOTO_MAX_BYTES)
      throw new Error("사진 사본을 만들지 못했어요. 다른 사진을 골라 주세요.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
    picture.src = "";
  }
}
