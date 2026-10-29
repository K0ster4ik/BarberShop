"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const noop = () => () => {};

/** Переключатель темы. До гидратации тема неизвестна — показываем пустую кнопку того же размера. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const dark = mounted && resolvedTheme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Светлая тема" : "Тёмная тема"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {mounted && (dark ? <Sun aria-hidden /> : <Moon aria-hidden />)}
    </Button>
  );
}
