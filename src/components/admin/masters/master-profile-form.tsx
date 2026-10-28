"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  NumberField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  type MasterProfileInput,
  masterProfileSchema,
} from "@/lib/validation/masters";
import { saveMasterProfile } from "@/server/masters/actions";

/** Профиль мастера. Новый мастер после сохранения открывается в своей карточке. */
export function MasterProfileForm({
  masterId,
  defaults,
  onDone,
}: {
  masterId: string | null;
  defaults?: MasterProfileInput;
  onDone?: () => void;
}) {
  const router = useRouter();
  const form = useForm<MasterProfileInput>({
    resolver: zodResolver(masterProfileSchema),
    defaultValues: defaults ?? {
      name: "",
      title: "",
      bio: "",
      isActive: true,
      sortOrder: 0,
    },
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          saveMasterProfile(masterId, values),
        );
        if (!result?.ok) return;
        onDone?.();
        if (!masterId) router.push(`/admin/masters/${result.data.id}`);
      })}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Имя и фамилия" />
        <TextField
          control={form.control}
          name="title"
          label="Должность"
          placeholder="Барбер, топ-барбер, колорист"
        />
        <TextareaField
          control={form.control}
          name="bio"
          label="О мастере"
          description="Показывается клиентам на сайте и при записи."
          rows={4}
        />
        <NumberField
          control={form.control}
          name="sortOrder"
          label="Порядок на сайте"
          description="Мастера с меньшим числом показываются выше."
        />
        <SwitchField
          control={form.control}
          name="isActive"
          label="Принимает записи"
          description="Отключённый мастер не виден на сайте, его история сохраняется."
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {masterId ? "Сохранить" : "Добавить мастера"}
        </Button>
      </FieldGroup>
    </form>
  );
}
