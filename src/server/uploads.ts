import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Хранилище загруженных файлов (фото мастеров). В продакшене папка — Docker volume.
// Модуль без `server-only`: его использует и сброс демо, который запускается через tsx.

// Сохранённое фото — исходник для next/image, а не то, что скачивает посетитель:
// оптимизатор отдаёт уменьшенные копии нужной ширины. Поэтому храним крупно и почти
// без потерь — иначе к сжатию next/image добавляется второе, и портрет «мылится».
export const MASTER_PHOTO = {
  width: 1200,
  height: 1500,
  quality: 90,
  maxBytes: 5 * 1024 * 1024,
  types: ["image/jpeg", "image/png", "image/webp"],
} as const;

const MASTERS_FOLDER = "masters";
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9]+)?$/;

/**
 * Абсолютный путь к файлу внутри uploads или null, если путь подозрительный.
 * Сегменты только из [a-z0-9_-] и одного расширения — «..», слэши и прочие
 * трюки отсекаются до обращения к диску.
 */
export function resolveUploadPath(
  uploadsDir: string,
  relative: string,
): string | null {
  const segments = relative.split("/");
  if (segments.some((segment) => !SAFE_SEGMENT.test(segment))) return null;
  const root = path.resolve(uploadsDir);
  const full = path.resolve(root, ...segments);
  return full.startsWith(root + path.sep) ? full : null;
}

/**
 * Фото мастера → WebP 4:5: самый крупный кадр 4:5, какой есть в снимке, но не больше
 * 1200×1500. Маленькие снимки не растягиваем — деталей от этого не прибавится.
 * sharp поворачивает по EXIF и не переносит метаданные (в том числе GPS).
 * Бросает ошибку, если файл не декодируется как изображение.
 */
export async function encodeMasterPhoto(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { failOn: "error" });
  const { autoOrient } = await image.metadata();
  const unit = Math.max(
    1,
    Math.floor(
      Math.min(
        MASTER_PHOTO.width / 4,
        autoOrient.width / 4,
        autoOrient.height / 5,
      ),
    ),
  );
  return (
    image
      .rotate()
      .resize(unit * 4, unit * 5, { fit: "cover", position: "attention" })
      // smartSubsample бережёт мелкие цветные детали: бороду, кожу, кожаный фартук.
      .webp({ quality: MASTER_PHOTO.quality, smartSubsample: true })
      .toBuffer()
  );
}

/** Сохраняет фото мастера под новым именем: файлы раздаются как immutable. */
export async function saveMasterPhoto(
  uploadsDir: string,
  masterId: string,
  input: Buffer,
): Promise<string> {
  const output = await encodeMasterPhoto(input);

  const relative = `${MASTERS_FOLDER}/${masterId}-${randomBytes(4).toString("hex")}.webp`;
  const full = resolveUploadPath(uploadsDir, relative);
  if (!full) throw new Error(`Unsafe upload path: ${relative}`);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, output);
  return relative;
}

export async function deleteUpload(
  uploadsDir: string,
  relative: string | null,
): Promise<void> {
  const full = relative ? resolveUploadPath(uploadsDir, relative) : null;
  if (full) await rm(full, { force: true });
}

/** Удаляет из папки мастеров файлы, на которые никто не ссылается. */
export async function pruneMasterPhotos(
  uploadsDir: string,
  keep: ReadonlySet<string>,
): Promise<number> {
  const dir = path.join(uploadsDir, MASTERS_FOLDER);
  const files = await readdir(dir).catch(() => [] as string[]);
  let removed = 0;
  for (const file of files) {
    const relative = `${MASTERS_FOLDER}/${file}`;
    if (!keep.has(relative)) {
      await deleteUpload(uploadsDir, relative);
      removed += 1;
    }
  }
  return removed;
}
