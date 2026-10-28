import Link from "next/link";
import { BookButton } from "./book-button";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b bg-background/95 supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link
          href="/"
          className="mr-auto text-sm font-semibold tracking-[0.28em] text-primary uppercase"
        >
          Барбершоп
        </Link>
        <ThemeToggle />
        <BookButton />
      </div>
    </header>
  );
}
