"use client";

import { useEffect, useState } from "react";
import type { ActionResult } from "@/server/action-result";

/**
 * Значение с сервера по ключу ввода: цена записи, свободное время. Запрос уходит
 * после паузы в наборе; ответ на устаревший ключ отбрасывается. key = null — нечего
 * спрашивать (форма заполнена не до конца).
 */
export function useServerValue<T>(
  key: string | null,
  load: (key: string) => Promise<ActionResult<T>>,
  delayMs = 350,
): { data: T | null; error: string | null; loading: boolean } {
  const [state, setState] = useState<{
    key: string | null;
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ key: null, data: null, error: null, loading: false });

  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      async () => {
        if (key === null) {
          setState({ key, data: null, error: null, loading: false });
          return;
        }
        setState((prev) => ({ ...prev, loading: true }));
        try {
          const result = await load(key);
          if (!current) return;
          setState(
            result.ok
              ? { key, data: result.data, error: null, loading: false }
              : { key, data: null, error: result.error, loading: false },
          );
        } catch {
          if (!current) return;
          setState({
            key,
            data: null,
            error: "Не удалось связаться с сервером.",
            loading: false,
          });
        }
      },
      key === null ? 0 : delayMs,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [key, load, delayMs]);

  // Пока новый ответ не пришёл, показываем прежний — но помечаем загрузку.
  return {
    data: state.data,
    error: state.error,
    loading: state.loading || state.key !== key,
  };
}
