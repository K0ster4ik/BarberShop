// Кладёт фото демо-мастера в prisma/seed-assets/masters тем же кодированием, что и загрузка
// в CRM. В имя входит хэш содержимого: /uploads раздаётся как immutable, и новое фото под
// старым именем браузеры и next/image ещё долго показывали бы по-старому.
//
// npx tsx scripts/encode-seed-photo.ts <оригинал.png> <имя, например master-artem-sokolov>

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodeMasterPhoto } from "../src/server/uploads";

async function main() {
  const [input, name] = process.argv.slice(2);
  if (!input || !name || !/^[a-z0-9-]+$/.test(name)) {
    throw new Error(
      "Использование: npx tsx scripts/encode-seed-photo.ts <оригинал> <имя-латиницей>",
    );
  }
  const output = await encodeMasterPhoto(await readFile(input));
  const hash = createHash("sha256").update(output).digest("hex").slice(0, 8);
  const file = `${name}-${hash}.webp`;
  await writeFile(path.join("prisma/seed-assets/masters", file), output);
  console.log(`${file} — ${Math.round(output.length / 1024)} КБ`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
