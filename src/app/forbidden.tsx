import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Нет доступа</h1>
      <p className="max-w-sm text-muted-foreground">
        У вашей учётной записи нет прав на эту страницу.
      </p>
      <Button asChild variant="outline">
        <Link href="/">На главную</Link>
      </Button>
    </main>
  );
}
