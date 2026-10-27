# Барбершоп: онлайн-запись + CRM

Портфолио-проект: сайт барбершопа с онлайн-записью и CRM для персонала.
Архитектура, модель данных и план работ описаны в [DESIGN.md](DESIGN.md).

## Требования

- Node.js 24 (см. `.nvmrc`)
- Docker (Postgres для разработки)

## Локальный запуск

```bash
npm install            # заодно генерирует Prisma Client
cp .env.example .env
npm run db:up          # Postgres в Docker на порту 5433
npm run db:migrate     # применить миграции
npm run db:seed        # демо-данные: мастера, услуги, ~400 клиентов, ~1300 записей
npm run dev            # http://localhost:3000
```

Проверка, что приложение видит БД: http://localhost:3000/api/health

Повторный `npm run db:seed` сбрасывает данные к исходному демо-состоянию.

CRM: http://localhost:3000/admin. Демо-пользователи: `owner@demo.ru`, `admin@demo.ru`, `master@demo.ru`, пароли берутся из `.env` (`DEMO_*_PASSWORD`).

## Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | dev-сервер |
| `npm run build` / `npm start` | production-сборка и запуск |
| `npm run check` | lint + typecheck + проверка форматирования + тесты |
| `npm run lint` | ESLint |
| `npm run typecheck` | генерация типов маршрутов Next.js + `tsc` |
| `npm run format` | Prettier |
| `npm test` | юнит-тесты (Vitest) |
| `npm run test:integration` | интеграционные тесты на отдельной БД `TEST_DATABASE_URL` (нужен `db:up`) |
| `npm run test:all` | все тесты |
| `npm run db:up` / `db:down` | запустить / остановить Postgres для разработки |
| `npm run db:migrate` | создать и применить миграцию |
| `npm run db:seed` | пересоздать демо-данные |
| `npm run db:studio` | Prisma Studio |
