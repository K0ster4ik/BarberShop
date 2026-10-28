"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useTransition } from "react";
import { ConfirmAction } from "@/components/forms/dialogs";
import { runWithToast } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { deleteMasterPhoto, uploadMasterPhoto } from "@/server/masters/actions";
import { MasterAvatar } from "./master-avatar";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

/** Фото мастера: загрузка сразу после выбора файла, сервер обрежет его до 4:5. */
export function MasterPhoto({
  masterId,
  name,
  photoPath,
}: {
  masterId: string;
  name: string;
  photoPath: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    // Проверка до отправки — чтобы не гонять 20 МБ на сервер ради отказа.
    if (file.size > MAX_BYTES) {
      void runWithToast(async () => ({ ok: false, error: "Файл больше 5 МБ" }));
      return;
    }
    const formData = new FormData();
    formData.set("photo", file);
    startTransition(async () => {
      await runWithToast(() => uploadMasterPhoto(masterId, formData));
    });
  }

  return (
    <div className="flex w-40 flex-col gap-2">
      <MasterAvatar
        name={name}
        photoPath={photoPath}
        className={pending ? "opacity-50" : undefined}
      />
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-label="Файл с фотографией"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => input.current?.click()}
      >
        <ImageUp aria-hidden />
        {pending
          ? "Загружаем…"
          : photoPath
            ? "Заменить фото"
            : "Загрузить фото"}
      </Button>
      {photoPath && (
        <ConfirmAction
          title="Удалить фото?"
          description="На сайте вместо фото будут инициалы мастера."
          action={() => deleteMasterPhoto(masterId)}
          trigger={
            <Button type="button" variant="ghost" disabled={pending}>
              <Trash2 aria-hidden /> Удалить фото
            </Button>
          }
        />
      )}
      <p className="text-xs text-muted-foreground">
        JPEG, PNG или WebP до 5 МБ. Обрежем до вертикального кадра 4:5.
      </p>
    </div>
  );
}
