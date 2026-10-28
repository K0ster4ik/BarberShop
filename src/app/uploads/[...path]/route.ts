import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";
import { resolveUploadPath } from "@/server/uploads";

// Раздача загруженных файлов. В продакшене их может отдавать Caddy напрямую
// из volume (DESIGN.md, 12.1); этот обработчик нужен для разработки и как запасной путь.

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

export async function GET(
  _request: Request,
  { params }: RouteContext<"/uploads/[...path]">,
) {
  const { path: segments } = await params;
  const file = resolveUploadPath(env.UPLOADS_DIR, segments.join("/"));
  const contentType = file ? CONTENT_TYPES[path.extname(file)] : undefined;
  if (!file || !contentType) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(file);
    return new Response(body, {
      headers: {
        "content-type": contentType,
        // Имя файла меняется при каждой загрузке, поэтому кэшировать можно навсегда.
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
