import Link from "next/link";
import { BookButton } from "./book-button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/#services", label: "Услуги" },
  { href: "/#masters", label: "Мастера" },
];

export function SiteHeader() {
  return (
    <header className="border-b bg-background/95 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="mr-auto flex min-h-11 items-center text-sm font-semibold tracking-[0.28em] text-primary uppercase sm:mr-6"
        >
          Барбершоп
        </Link>
        <nav aria-label="Разделы" className="mr-auto hidden gap-1 sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
        <BookButton />
      </div>
    </header>
  );
}
