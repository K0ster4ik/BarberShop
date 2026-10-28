---
name: codex-qa
description: Exploratory end-to-end testing of the running app by OpenAI Codex driving its own browser — it walks through real user scenarios (booking, cancellation, login, role restrictions, mobile layout) like a manual tester and reports bugs with steps to reproduce. Use at the end of stages that change user-facing flows, before demos, and when the user asks to "протестировать", "QA", "пройти сценарии", "дополнительное тестирование". It complements unit/integration tests and next-dev-loop rather than replacing them.
---

# Codex QA

Automated tests check what someone thought of in advance; an exploratory pass by another agent finds
what nobody thought of: double submits, the back button, odd input, a 375px layout. Every reported
bug is a hypothesis until reproduced.

## Before the run

- The app is running against seeded demo data (`npm run db:up`, `npm run db:seed`, `npm run dev`).
- Codex's browser feature is on: `codex features list` shows `browser_use ... true`.
- Credentials: local demo accounts only (`owner@demo.ru`, `admin@demo.ru`, `master@demo.ru`) with
  the dev passwords from `.env.example`. These are public anyway. Never give Codex production
  credentials or the real `.env` secrets.

## Run

Write the prompt (Russian) to a scratchpad file:

```text
Ты — тестировщик. Приложение запущено на http://localhost:3000 (сайт барбершопа и CRM).
Пройди в браузере сценарии этапа: <список из DESIGN.md для текущего этапа>.
Дополнительно попробуй: двойную отправку форм, кнопку «назад», некорректный ввод,
ширину экрана 375px, доступ к чужим разделам под ролью мастера.
Учётные записи для CRM: <демо-логины и dev-пароли из .env.example>.
Ничего не меняй в коде. Для каждой ошибки — шаги воспроизведения, ожидаемый и фактический результат.
```

```bash
node scripts/codex/run.mjs exec --name qa-<stage> --schema scripts/codex/schemas/qa.json \
  --timeout 25 --prompt-file <scratchpad>/qa-prompt.md
```

Run it in the background; exploratory runs take 10–25 minutes.

## Triage

Reproduce each reported bug yourself, with agent-browser or a test, before fixing it. Fix confirmed
bugs together with a regression test (integration or e2e). Report:

| Важность | Ошибка | Воспроизвелась? | Что сделано |
|---|---|---|---|

## Fallback

If Codex can't drive a browser in `exec` mode (no browser tool in its output, or `blocked`
everywhere), do the exploratory pass yourself with agent-browser's own guide
(`agent-browser skills get dogfood`), and tell the user the Codex part was skipped and why.
