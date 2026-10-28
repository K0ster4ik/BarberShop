"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Граница ошибок для всего приложения. Ошибки из Server Components приходят
// без подробностей (только digest) — так детали не утекают пользователю.
export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        Что-то пошло не так
      </h1>
      <p className="max-w-sm text-muted-foreground">
        Произошла непредвиденная ошибка. Попробуйте ещё раз или обновите
        страницу.
      </p>
      {digest && (
        <p className="text-xs text-muted-foreground">Код ошибки: {digest}</p>
      )}
      <Button onClick={() => retry()}>Попробовать ещё раз</Button>
    </main>
  );
}
