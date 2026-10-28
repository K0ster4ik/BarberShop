import Link from "next/link";
import { Button } from "@/components/ui/button";

// 404 для всего приложения: и для notFound(), и для несуществующих адресов.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">Ошибка 404</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        Страница не найдена
      </h1>
      <p className="max-w-sm text-muted-foreground">
        Возможно, ссылка устарела или в адресе опечатка.
      </p>
      <Button asChild variant="outline">
        <Link href="/">На главную</Link>
      </Button>
    </main>
  );
}
