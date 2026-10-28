"use client";

import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Без регистрации ссылка — единственный доступ к записи: копируем её в один тап. */
export function CopyLinkButton() {
  return (
    <Button
      variant="outline"
      size="lg"
      className="h-11"
      onClick={() => {
        navigator.clipboard.writeText(window.location.href).then(
          () => toast.success("Ссылка скопирована"),
          () =>
            toast.error("Не получилось скопировать — сохраните адрес страницы"),
        );
      }}
    >
      <Link2 aria-hidden /> Скопировать ссылку
    </Button>
  );
}
