import Link from "next/link";
import { env } from "@/env";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          Демо-проект: салона не существует, данные сбрасываются каждый час.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          {env.TELEGRAM_CHANNEL_URL && (
            <a
              href={env.TELEGRAM_CHANNEL_URL}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Заявки в Telegram
            </a>
          )}
          <Link
            href="/privacy"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Обработка персональных данных
          </Link>
        </nav>
      </div>
    </footer>
  );
}
