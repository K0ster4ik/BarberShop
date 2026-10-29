import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Раздел есть, но роли сотрудника он недоступен (forbidden() → 403).
export default function AdminForbidden() {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex items-center gap-3">
        <ShieldAlert className="size-6 text-destructive" aria-hidden />
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Нет доступа
        </h1>
      </div>
      <p className="text-muted-foreground">
        Этот раздел недоступен для вашей роли.
      </p>
      <Button asChild variant="outline">
        <Link href="/admin">На главную CRM</Link>
      </Button>
    </div>
  );
}
