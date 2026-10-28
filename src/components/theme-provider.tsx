"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

// Темы ставятся атрибутом data-theme на <html> (токены — в globals.css).

/** Сайт: светлая или тёмная тема, по умолчанию как в системе, с переключателем. */
export function SiteThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      themes={["light", "dark"]}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}

/** Админка — всегда в своей нейтральной теме: при переходе с сайта тема сайта снимается. */
export function AdminThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      themes={["admin"]}
      forcedTheme="admin"
      enableSystem={false}
    >
      {children}
    </ThemeProvider>
  );
}
