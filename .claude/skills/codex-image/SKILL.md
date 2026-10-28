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
- **format** — master portrait 4:5 (800×1000), hero 16:9 (1920×1080), Open Graph 1200×630,
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
Сохрани результат в текущую рабочую папку как <name>.webp в размере <W×H>, качество около 80.
Не создавай других файлов.
```

Ask for WebP (or JPEG for photos) up front: Codex resizes and converts the result itself, while a
PNG portrait at 800×1000 comes out around 2 MB — too heavy for the site. The untouched original
stays in `~/.codex/generated_images/<session>/` in case a different crop is needed later.

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

- Copy the chosen image to its destination. Ask Codex for the target size up front so files stay
  reasonable (photos under ~400 KB); Next.js `<Image>` serves optimised variants at runtime.
- Add a line to `public/images/README.md` (create it if missing): file, purpose, short prompt,
  session id, date. This is what makes regeneration possible.
- In the report, list the images with paths and note that they are AI-generated with fictional
  people.

Codex image generation uses the user's ChatGPT plan limits and is noticeably more expensive than
text, so generate what the brief needs rather than many speculative variants.
