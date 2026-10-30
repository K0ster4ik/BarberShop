import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * «Назад · Страница 2 из 5 · Дальше» для списков CRM. `href(page)` строит адрес
 * страницы с теми же фильтрами.
 */
export function Pager({
  page,
  pageCount,
  href,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label="Страницы"
      className="flex items-center justify-between gap-3"
    >
      <PageLink href={page > 1 ? href(page - 1) : null} direction="prev" />
      <span className="text-sm text-muted-foreground">
        Страница {page} из {pageCount}
      </span>
      <PageLink
        href={page < pageCount ? href(page + 1) : null}
        direction="next"
      />
    </nav>
  );
}

function PageLink({
  href,
  direction,
}: {
  href: string | null;
  direction: "prev" | "next";
}) {
  const content =
    direction === "prev" ? (
      <>
        <ChevronLeft aria-hidden /> Назад
      </>
    ) : (
      <>
        Дальше <ChevronRight aria-hidden />
      </>
    );
  if (!href) {
    return (
      <Button variant="outline" className="h-11 sm:h-8" disabled>
        {content}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" className="h-11 sm:h-8">
      <Link href={href}>{content}</Link>
    </Button>
  );
}
