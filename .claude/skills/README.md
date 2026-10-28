# Навыки Claude Code для проекта

Навыки из этой папки Claude Code подхватывает автоматически. Описание навыка (`description` в
`SKILL.md`) решает, когда он срабатывает; тело читается только при срабатывании.

## Свои: работа с OpenAI Codex

Все вызывают Codex через `scripts/codex/run.mjs`; схемы ответов — в `scripts/codex/schemas/`,
журналы запусков — в `.codex-runs/` (не в git).

| Навык | Что делает |
|---|---|
| `codex-review` | Ревью ветки этапа в Codex + проверка каждой находки перед правкой |
| `codex-image` | Генерация изображений (фото мастеров, обложки, OG-картинки) |
| `codex-ux` | Концепт-макеты экранов до вёрстки и разбор скриншотов после |
| `codex-qa` | Codex составляет план рискованных сценариев, Claude проходит их в браузере |

Требуется: `npm install -g @openai/codex` и `codex login` (вход через аккаунт ChatGPT).

## Сторонние

Скопированы из официальных репозиториев после проверки содержимого. Чтобы обновить — заново
скопировать папку из источника, перечитать изменения и поправить коммит в таблице.

| Навык | Источник (коммит) | Лицензия | Примечание |
|---|---|---|---|
| `next-dev-loop` | `vercel/next.js` `skills/` (9da349b) | MIT | Нужен `agent-browser` ≥ 0.31.1: `npm i -g agent-browser` |
| `next-cache-components-optimizer` | `vercel/next.js` `skills/` (9da349b) | MIT | |
| `next-partial-prefetching-optimizer` | `vercel/next.js` `skills/` (9da349b) | MIT | |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` `skills/react-best-practices` (1a2c79d) | MIT | |
| `web-design-guidelines` | `vercel-labs/agent-skills` (1a2c79d) + `vercel-labs/web-interface-guidelines` (434b7f9) | MIT | Изменён: правила лежат снимком в `guidelines.md`, а не скачиваются при каждом запуске |
| `frontend-design` | `anthropics/skills` (dbd4588) | Apache-2.0 | |
| `prisma-cli`, `prisma-client-api` | `prisma/skills` (c71e8ea) | MIT | |
| `shadcn` | `shadcn-ui/ui` `skills/shadcn` (96da9cc) | MIT | |

## Не в репозитории

Навыки Better Auth (`better-auth/skills`) опубликованы без лицензии, поэтому в репозиторий не
скопированы. Они установлены в профиль пользователя (`~/.claude/skills/`):
`better-auth-best-practices`, `email-and-password-best-practices`,
`better-auth-security-best-practices`. На другой машине: `npx skills add better-auth/skills`.
