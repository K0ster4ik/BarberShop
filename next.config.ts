import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // forbidden() → 403 и forbidden.tsx для сотрудников без нужной роли.
    authInterrupts: true,
    // Фото мастера до 5 МБ плюс накладные расходы multipart (по умолчанию лимит 1 МБ).
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: {
    // Загруженные фото отдаются по /uploads/...; имя файла меняется при каждой
    // загрузке, поэтому query-параметры не нужны и запрещены.
    localPatterns: [{ pathname: "/uploads/**", search: "" }],
  },
  logging: {
    // В dev Next.js печатает аргументы Server Actions: пароли со входа, а дальше
    // имена и телефоны клиентов. Персональные данные не логируем (DESIGN.md, раздел 10).
    serverFunctions: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
