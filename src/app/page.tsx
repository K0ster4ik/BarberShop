import { Button } from "@/components/ui/button";

// Временная заглушка: главная страница собирается на этапе 10.
export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Барбершоп</h1>
      <p className="max-w-sm text-muted-foreground">
        Сайт с онлайн-записью в разработке.
      </p>
      <Button disabled>Записаться</Button>
    </main>
  );
}
