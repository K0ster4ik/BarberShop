---
name: codex-review
description: Independent second-opinion code review of the current branch by OpenAI Codex, followed by Claude's own verification of every finding before anything is changed. Use at the end of every project stage (before handing the stage to the user or merging it into main), before a push, and whenever the user asks for "ревью", "второе мнение", "проверь код через Codex", "codex review" or extra checking of code. Also use, even unasked, when a change touches auth and roles, money and discounts, booking/slot logic, database constraints or personal data.
---

# Codex review

A second model catches a different class of mistakes than the one that wrote the code, which is why
every stage gets one Codex review. But Codex findings are hypotheses, not verdicts: it reads the diff
without running anything and is sometimes confidently wrong. The value comes from the triage step,
where each finding is checked against the code before it changes anything or reaches the user.

## 1. Run the review

The stage's work should be committed on its branch (review against `main`). For work not yet
committed, use `--uncommitted` instead of `--base main`.

Write the review instructions to a temp file (scratchpad), filling in the template below, then run in
the background — a review takes 2–10 minutes:

```bash
node scripts/codex/run.mjs review --name review-<branch> --base main \
  --schema scripts/codex/schemas/review.json --prompt-file <scratchpad>/review-prompt.md
```

Use `run_in_background: true` and wait for the notification. The result (JSON matching
`scripts/codex/schemas/review.json`) is printed to stdout and saved in `.codex-runs/<run>/last.md`.

Instructions template (Codex answers in the language of the prompt, and the findings end up in a
Russian report, so write it in Russian):

```text
Сделай ревью изменений этой ветки относительно main в проекте «Барбершоп»
(Next.js 16 с Cache Components, Prisma 7 + PostgreSQL, Better Auth). Правила проекта —
в DESIGN.md (особенно разделы 4, 5.2, 7 и 10) и AGENTS.md.

Этап: <номер и название>. Что изменилось: <2–5 пунктов>.

Ищи в первую очередь:
- ошибки логики и граничные случаи;
- нарушения прав доступа: requireRole в каждом Server Action и Route Handler, фильтры «только своё» для MASTER;
- нарушения инвариантов денег, времени и записей из раздела 5.2;
- гонки и проблемы транзакций;
- утечки персональных данных в логи и ответы;
- расчётную логику без тестов.

Не пиши про стиль и форматирование — это проверяют ESLint и Prettier.
У каждой находки — конкретный сценарий поломки. Если не уверен, так и напиши в details.
Пиши по-русски.
```

## 2. Triage every finding

For each finding, before touching code:

1. Read the cited code and its callers; check whether the failure scenario can actually happen.
2. For a suspected bug, prefer proving it with a failing test (unit or integration) — the test then
   stays as a regression guard after the fix.
3. Give it a verdict:
   - **подтверждено** — real problem; fix it together with a test;
   - **не воспроизводится** — explain briefly why the scenario cannot happen;
   - **так задумано** — cite the DESIGN.md decision it conflicts with;
   - **позже** — valid, but belongs to a later stage; note which one.

After fixes, rerun `npm run check` and the integration tests. Don't rerun Codex just to get a clean
report: one review per stage, plus at most one re-check after substantial fixes.

## 3. Report to the user (Russian)

Add a short section to the stage report:

| Важность | Находка | Вердикт | Что сделано |
|---|---|---|---|

Mention the run folder (`.codex-runs/...`) so the raw output can be inspected. Don't paste Codex's
text as-is; the report is your verified conclusion.

## When Codex is unavailable

- Exit code 2 means the login expired: ask the user to run `codex logout && codex login`.
- Timeouts or other errors: say so in the report and continue the stage — the review is an extra
  check, not a gate.
