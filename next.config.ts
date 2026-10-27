import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // forbidden() → 403 и forbidden.tsx для сотрудников без нужной роли.
    authInterrupts: true,
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
