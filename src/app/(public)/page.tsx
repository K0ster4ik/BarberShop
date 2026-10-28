import Link from "next/link";
import { Button } from "@/components/ui/button";

// Временная главная: полноценная собирается на этапе 10 (DESIGN.md, раздел 15).
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Барбершоп</h1>
      <p className="max-w-sm text-muted-foreground">
        Стрижки, борода и уход. Запись онлайн — меньше минуты, без регистрации.
      </p>
      <Button asChild size="lg">
        <Link href="/book">Записаться</Link>
      </Button>
    </div>
  );
}
