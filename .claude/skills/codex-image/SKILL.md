---
name: codex-image
description: Generate raster images with OpenAI Codex's built-in image generation and place them into the project — photos, illustrations, backgrounds, portraits for demo data, Open Graph previews, empty-state art, icons. Use whenever the site or demo data needs a picture (master photos instead of initials, hero/cover images, service illustrations, social previews) or the user asks to "сгенерировать картинку/фото/иллюстрацию/обложку", even without mentioning Codex. Not for UI mockups (use codex-ux) or diagrams.
---

# Codex image

Claude can't produce raster images; Codex can, through its image generation tool. This skill wraps
that in a repeatable loop: a precise brief, generation, Claude's own visual check, and a manifest so
any image can be regenerated later.

## 1. Brief

Decide before generating:

- **purpose and place** — where it is shown and at what size;
- **format** — master portrait 4:5 (Codex's native ~1120×1400), hero 16:9 (1920×1080), Open Graph 1200×630,
  square icon 512×512;
- **destination** — `public/images/<group>/` for the site, `prisma/seed-assets/` for demo data;
- **file name** — lowercase, hyphenated, meaningful (`master-artem-sokolov.webp`).

Build the prompt from the subject plus the shared style in `references/style.md` (read it; it keeps
the whole set visually consistent). For master portraits, also attach the approved sample
`references/style-sample-master.webp` with `--image`; words alone drift between runs, a reference
image keeps light and framing the same across the set. Always include these constraints: no text or letters in the
image unless the brief needs it, no logos or watermarks, only fictional people — never a real
person's likeness.

## 2. Generate

Write the prompt for Codex to a scratchpad file. It must state the output explicitly, because Codex
otherwise may describe the image instead of saving it:

```text
Сгенерируй изображение встроенным инструментом генерации изображений.
<описание по брифу и стилю>
Сохрани результат в текущую рабочую папку как <name>.png в исходном размере, без пересжатия.
Не создавай других файлов.
```

Let Codex keep the PNG at full resolution and do the lossy encoding once, yourself. An earlier
version of this skill asked Codex for an 800×1000 WebP at quality 80; `next/image` then compressed
it a second time and large portraits looked smeared. The untouched original also stays in
`~/.codex/generated_images/<session>/`. Encode master portraits with the project script, which
matches the CRM upload pipeline (WebP 4:5, quality 90, at most 1200×1500) and puts a content hash
in the file name:

```bash
npx tsx scripts/encode-seed-photo.ts <original.png> master-<name>
```

The hash matters because `/uploads` is served as immutable: a new picture under an old name would
keep showing the old one in browsers and in the `next/image` cache. For other image types, encode
once with sharp at quality ~90 and keep files under ~400 KB.

```bash
node scripts/codex/run.mjs exec --name img-<slug> --sandbox workspace-write \
  --collect-images <scratchpad>/images-<slug> --prompt-file <scratchpad>/img-prompt.md
```

`--sandbox workspace-write` lets Codex write only inside its run folder. `--collect-images` copies
the images Codex saved there into the given folder and lists the paths. A run takes about
2–3 minutes; run it in the background.

## 3. Check it yourself

Open each image with the Read tool and look at it. Check: matches the brief, no artifacts (hands,
eyes, garbled text), framing works at the target size, fits the existing set.

To fix something, continue the same Codex session instead of starting over — it keeps the context
and costs less:

```bash
node scripts/codex/run.mjs exec --name img-<slug>-v2 --resume <session id from session.txt> \
  --collect-images <scratchpad>/images-<slug> --prompt-file <scratchpad>/fix.md
```

Give concrete corrections ("свет мягче, фон темнее, убрать второго человека"). After about three
rounds without success, stop and show the user the best options instead of spending more.

## 4. Place and record

- Put the encoded image (step 2) at its destination. Next.js `<Image>` serves resized variants at
  runtime, so the stored file is a high-quality source, not what visitors download.
- Add a line to the manifest — `prisma/seed-assets/README.md` for demo data, `public/images/README.md`
  for the site (create it if missing): file, purpose, short prompt, session id, date. This is what
  makes regeneration possible.
- In the report, list the images with paths and note that they are AI-generated with fictional
  people.

Codex image generation uses the user's ChatGPT plan limits and is noticeably more expensive than
text, so generate what the brief needs rather than many speculative variants.
