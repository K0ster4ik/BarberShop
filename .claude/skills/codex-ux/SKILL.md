---
name: codex-ux
description: UX/UI help from OpenAI Codex in two modes — concept mockups of a screen generated as images before it is built, and a critique of the built UI from real screenshots at phone and desktop widths. Use when starting any new user-facing screen or flow (public pages, booking wizard, CRM screens), when the user asks for "макет", "дизайн", "UX", "посмотри как выглядит", "сделай красивее", and at the end of every stage that changed UI, before handing it to the user. Works together with frontend-design (aesthetic direction) and web-design-guidelines (code-level UI rules).
---

# Codex UX

Codex can both draw (image generation) and look at screenshots, which gives two checkpoints: a
visual direction before code is written, and an outside critique of what was actually built.
Mockups set direction rather than a pixel spec; the critique is a list of hypotheses to verify,
like code review findings.

## Mode A — concept before building

1. Collect the spec from DESIGN.md: who uses the screen and for what task, which data it shows,
   the main actions, empty and error states. Constraints: shadcn/ui (radix-nova) with Tailwind,
   mobile-first at 375px, Russian copy, realistic demo data.
2. Ask Codex for 2–3 clearly different concepts, each as a phone (375 wide) and a desktop image.
   Use the generation flow from the codex-image skill (`--sandbox workspace-write
   --collect-images`). In the prompt, ask for realistic Russian copy and real data shapes, with no
   lorem ipsum.
3. Look at the results with the Read tool and show them to the user with one or two lines on each
   concept's trade-offs. Ask which direction to take, unless the user has delegated the choice.
4. Save the chosen concept to `docs/design/<screen>-concept.png` and build with the frontend-design
   skill. Keep shadcn tokens, accessibility and DESIGN.md requirements even where the mockup ignores
   them.

## Mode B — critique of the built UI

1. The app must be running (`npm run db:up`, `npm run dev`, demo data from `npm run db:seed`).
2. Take screenshots with agent-browser into a scratchpad folder: every changed route at 375×812 and
   1280×800, full page. For CRM pages, sign in first with the demo accounts from `.env`. Type
   passwords into the browser only, never into a Codex prompt.

   ```bash
   export AGENT_BROWSER_SESSION=barbershop-ux
   agent-browser open http://localhost:3000/admin/login
   agent-browser snapshot            # refs for the email/password fields
   agent-browser fill @e1 "owner@demo.ru"; agent-browser fill @e2 "<password from .env>"
   agent-browser click @e3; agent-browser wait --load networkidle
   agent-browser set viewport 375 812
   agent-browser open http://localhost:3000/admin; agent-browser wait --load networkidle
   agent-browser screenshot --full <scratchpad>/shots/admin-today-mobile.png
   agent-browser set viewport 1280 800
   agent-browser screenshot --full <scratchpad>/shots/admin-today-desktop.png
   agent-browser close
   ```

   Run `agent-browser skills get core` once if a command doesn't behave as expected.
3. Send the screenshots to Codex with the UX schema:

   ```bash
   node scripts/codex/run.mjs exec --name ux-<slug> --schema scripts/codex/schemas/ux.json \
     --image <shot1.png> --image <shot2.png> --prompt-file <scratchpad>/ux-prompt.md
   ```

   In the prompt (Russian), say who uses each screen and for which task, list the screenshots
   with their routes and widths, and point to DESIGN.md section 11. Ask for concrete problems
   ranked by how much they hurt the user, not general advice.
4. Triage each finding against the screenshot and the code:
   - fix the ones that are right (cross-check with web-design-guidelines);
   - skip taste-only suggestions that contradict design decisions, and say why.
5. Re-shoot after the fixes and add a "было/стало" pair for the most visible changes to the report,
   together with the findings table:

   | Важность | Экран | Проблема | Вердикт | Что сделано |
   |---|---|---|---|---|
