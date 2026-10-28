---
name: codex-qa
description: Exploratory end-to-end testing with OpenAI Codex as the test designer — Codex reads the change, the code and DESIGN.md and returns a risk-ranked plan of browser scenarios (edge cases, role restrictions, double submits, back button, 375px), then Claude walks through every scenario in a real browser with agent-browser and reports bugs with steps to reproduce. Use at the end of stages that change user-facing flows, before demos, and when the user asks to "протестировать", "QA", "пройти сценарии", "дополнительное тестирование". Complements unit/integration tests and next-dev-loop rather than replacing them.
---

# Codex QA

Automated tests check what someone thought of in advance. The value of this pass is a second
model thinking up what nobody thought of, and then actually trying it in a browser.

Codex can't drive the browser itself here. In `codex exec` mode there is no browser tool (the
`browser_use` feature only works inside the Codex app). Its sandbox also blocks agent-browser:
the socket folder `~/.agent-browser` is not writable from the sandbox, and agent-browser takes
the home folder from the Windows API, so redirecting `USERPROFILE` doesn't help. Checked on
2026-10-28; if a future Codex version gains a browser in `exec`, revisit this. So the work is
split: **Codex designs the scenarios, Claude executes them.**

## 1. Get a test plan from Codex

Write the prompt (Russian) to a scratchpad file:

```text
Ты — опытный тестировщик. Составь план исследовательского тестирования для этапа
<номер и название> проекта «Барбершоп». Изучи изменения (<диапазон, например git diff main...HEAD>),
код и DESIGN.md (разделы <…>). Код не меняй.

Нужны сценарии, которые скорее всего найдут ошибки: граничные случаи, права ролей,
повторная отправка форм, кнопка «назад», некорректный ввод, ширина 375px, прямые ссылки
на чужие разделы, состояние после выхода. Для каждого — риск со ссылкой на код,
конкретные шаги в браузере и наблюдаемый ожидаемый результат.
Не включай то, что уже покрыто тестами в tests/ (посмотри их).
Роли: guest, owner, admin, master (демо-учётки). Пиши по-русски.
```

```bash
node scripts/codex/run.mjs exec --name qa-plan-<stage> --schema scripts/codex/schemas/qa-plan.json \
  --prompt-file <scratchpad>/qa-plan-prompt.md
```

This takes 1–5 minutes; run it in the background.

## 2. Execute every scenario with agent-browser

The app must be running against seeded demo data (`npm run db:up`, `npm run db:seed`,
`npm run dev`). Run `agent-browser skills get core` once if unsure of a command, and read
`agent-browser skills get dogfood` for the exploratory-testing workflow.

- Use one session per role (`--session qa-owner`, `qa-master`, …), so logins don't interfere.
- Sign in through the form with the demo accounts from `.env`. Mind the login limit: 10 attempts per
  10 minutes from one IP, which locally means all attempts. Restart the dev server if you hit it.
- Before each scenario set the viewport it asks for (`set viewport 375 812` or `1280 800`). After each
  step, check the observable result (`get url`, `snapshot`, screenshot for anything visual).
- Record each scenario as passed, failed (with what actually happened), or not applicable (say why).

## 3. Triage and report

A failure is a hypothesis until you understand it: confirm it is a real bug, not a test-plan
mistake. Fix confirmed bugs together with a regression test (unit, integration or e2e). Report in
Russian:

| Сценарий | Результат | Ошибка | Что сделано |
|---|---|---|---|

Mention the plan's run folder in `.codex-runs/`.
