import { Info } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";

const linkClass =
  "flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-muted-foreground">
        <p className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <span className="font-medium">Это демо-проект:</span> салона не
            существует, данные сбрасываются каждый час.
          </span>
        </p>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="flex min-h-11 items-center text-sm font-semibold tracking-[0.28em] text-primary uppercase"
          >
            Барбершоп
          </Link>
          <nav aria-label="Документы" className="flex flex-wrap gap-x-5">
            {env.TELEGRAM_CHANNEL_URL && (
              <a
                href={env.TELEGRAM_CHANNEL_URL}
                target="_blank"
                rel="noreferrer"
                className={linkClass}
              >
                Заявки в Telegram
              </a>
            )}
            <Link href="/privacy" className={linkClass}>
              Обработка персональных данных
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
