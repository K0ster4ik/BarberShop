"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ConfirmAction, FormDialog } from "@/components/forms/dialogs";
import {
  FormSubmit,
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "@/components/forms/fields";
import { runWithToast, submitAction } from "@/components/forms/submit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup } from "@/components/ui/field";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import {
  type ClientDiscountInput,
  type ClientNoteInput,
  type ClientProfileInput,
  clientDiscountSchema,
  clientNoteSchema,
  clientProfileSchema,
  TAG_COLORS,
  type TagInput,
  tagSchema,
} from "@/lib/validation/clients";
import {
  addNote,
  addTag,
  removeNote,
  removeTag,
  saveClientDiscount,
  saveClientProfile,
  saveClientTags,
} from "@/server/clients/actions";
import type { TagOption } from "@/server/clients/queries";
import { TAG_COLOR_LABELS, TagBadge } from "./tag-badge";

// Действия карточки клиента (DESIGN.md, 8.1). Кнопки показываются по роли, а права
// ещё раз проверяет сервер.

const TOUCH = "h-11 sm:h-8";

export function EditClientButton({
  clientId,
  defaults,
}: {
  clientId: string;
  defaults: ClientProfileInput;
}) {
  return (
    <FormDialog
      title="Контакты клиента"
      trigger={
        <Button variant="outline" className={TOUCH}>
          <Pencil aria-hidden /> Изменить
        </Button>
      }
    >
      {(close) => (
        <ProfileForm clientId={clientId} defaults={defaults} onDone={close} />
      )}
    </FormDialog>
  );
}

function ProfileForm({
  clientId,
  defaults,
  onDone,
}: {
  clientId: string;
  defaults: ClientProfileInput;
  onDone: () => void;
}) {
  const form = useForm<ClientProfileInput>({
    resolver: zodResolver(clientProfileSchema),
    defaultValues: defaults,
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          saveClientProfile(clientId, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Имя" />
        <TextField
          control={form.control}
          name="phone"
          label="Телефон"
          type="tel"
          inputMode="tel"
        />
        <TextField
          control={form.control}
          name="email"
          label="Email"
          type="email"
          description="Необязательно."
        />
        <TextField
          control={form.control}
          name="birthday"
          label="День рождения"
          type="date"
          description="Необязательно."
        />
        <FormSubmit pending={form.formState.isSubmitting}>Сохранить</FormSubmit>
      </FieldGroup>
    </form>
  );
}

export function DiscountButton({
  clientId,
  defaults,
}: {
  clientId: string;
  defaults: ClientDiscountInput;
}) {
  return (
    <FormDialog
      title="Постоянная скидка"
      description="Применяется к каждой записи клиента. Из промокода и постоянной скидки берётся большая."
      trigger={
        <Button variant="outline" className={TOUCH}>
          {defaults.enabled ? "Изменить скидку" : "Дать скидку"}
        </Button>
      }
    >
      {(close) => (
        <DiscountForm clientId={clientId} defaults={defaults} onDone={close} />
      )}
    </FormDialog>
  );
}

function DiscountForm({
  clientId,
  defaults,
  onDone,
}: {
  clientId: string;
  defaults: ClientDiscountInput;
  onDone: () => void;
}) {
  const form = useForm<ClientDiscountInput>({
    resolver: zodResolver(clientDiscountSchema),
    defaultValues: defaults,
  });
  const [enabled, kind] = useWatch({
    control: form.control,
    name: ["enabled", "kind"],
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          saveClientDiscount(clientId, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <SwitchField
          control={form.control}
          name="enabled"
          label="Скидка есть"
        />
        {enabled && (
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              control={form.control}
              name="kind"
              label="Вид"
              options={[
                { value: "PERCENT", label: "Процент" },
                { value: "AMOUNT", label: "Сумма" },
              ]}
            />
            <NumberField
              control={form.control}
              name="value"
              label="Размер"
              suffix={kind === "AMOUNT" ? "₽" : "%"}
              step={kind === "AMOUNT" ? 0.01 : 1}
              nullable
            />
          </div>
        )}
        <FormSubmit pending={form.formState.isSubmitting}>Сохранить</FormSubmit>
      </FieldGroup>
    </form>
  );
}

/** Теги клиента: отметить нужные, завести новый, удалить ненужный совсем. */
export function TagsButton({
  clientId,
  tags,
  selected,
}: {
  clientId: string;
  tags: TagOption[];
  selected: string[];
}) {
  return (
    <FormDialog
      title="Теги клиента"
      description="По тегам фильтруется список клиентов."
      trigger={
        <Button variant="outline" className={TOUCH}>
          <Tags aria-hidden /> Теги
        </Button>
      }
    >
      {(close) => (
        <TagsForm
          clientId={clientId}
          tags={tags}
          selected={selected}
          onDone={close}
        />
      )}
    </FormDialog>
  );
}

function TagsForm({
  clientId,
  tags,
  selected,
  onDone,
}: {
  clientId: string;
  tags: TagOption[];
  selected: string[];
  onDone: () => void;
}) {
  const [checked, setChecked] = useState(() => new Set(selected));
  const [pending, startTransition] = useTransition();
  // Новые и удалённые теги приходят с сервера после refresh(): props обновляются.

  return (
    <div className="flex flex-col gap-4">
      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Тегов пока нет — заведите первый ниже.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-2">
              <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted/60">
                <Checkbox
                  checked={checked.has(tag.id)}
                  onCheckedChange={(next) =>
                    setChecked((current) => {
                      const copy = new Set(current);
                      if (next) copy.add(tag.id);
                      else copy.delete(tag.id);
                      return copy;
                    })
                  }
                />
                <TagBadge name={tag.name} color={tag.color} />
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {tag.clients}
                </span>
              </label>
              <ConfirmAction
                title={`Удалить тег «${tag.name}»?`}
                description={
                  tag.clients > 0
                    ? `Тег снимется у ${tag.clients} ${plural(tag.clients, ["клиента", "клиентов", "клиентов"])}.`
                    : "Тег ни у кого не стоит."
                }
                action={() => removeTag(tag.id)}
                trigger={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Удалить тег «${tag.name}»`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <NewTagForm />
      <Button
        className="w-full sm:w-auto"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const known = new Set(tags.map((tag) => tag.id));
            const result = await runWithToast(() =>
              saveClientTags(
                clientId,
                [...checked].filter((id) => known.has(id)),
              ),
            );
            if (result?.ok) onDone();
          })
        }
      >
        Сохранить теги
      </Button>
    </div>
  );
}

function NewTagForm() {
  const form = useForm<TagInput>({
    resolver: zodResolver(tagSchema),
    defaultValues: { name: "", color: "amber" },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-dashed p-3"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () => addTag(values));
        if (result?.ok) form.reset({ name: "", color: values.color });
      })}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <TextField
          control={form.control}
          name="name"
          label="Новый тег"
          autoComplete="off"
        />
        <SelectField
          control={form.control}
          name="color"
          label="Цвет"
          options={TAG_COLORS.map((color) => ({
            value: color,
            label: TAG_COLOR_LABELS[color],
          }))}
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        className={cn(TOUCH, "w-fit")}
        disabled={form.formState.isSubmitting}
      >
        <Plus aria-hidden /> Добавить тег
      </Button>
    </form>
  );
}

export type NoteItem = {
  id: string;
  text: string;
  author: string; // «Мария Лебедева» или «сотрудник удалён»
  createdAt: string; // «3 ноября в 14:20»
  canDelete: boolean;
};

/** Заметки о клиенте: пишет любой сотрудник, который видит клиента. */
export function ClientNotes({
  clientId,
  notes,
}: {
  clientId: string;
  notes: NoteItem[];
}) {
  const form = useForm<ClientNoteInput>({
    resolver: zodResolver(clientNoteSchema),
    defaultValues: { text: "" },
  });
  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={form.handleSubmit(async (values) => {
          const result = await submitAction(form, () =>
            addNote(clientId, values),
          );
          if (result?.ok) form.reset({ text: "" });
        })}
      >
        <TextareaField
          control={form.control}
          name="text"
          label="Новая заметка"
          rows={2}
        />
        <Button
          type="submit"
          variant="outline"
          className={cn(TOUCH, "w-fit")}
          disabled={form.formState.isSubmitting}
        >
          Добавить заметку
        </Button>
      </form>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Заметок пока нет. Здесь удобно держать то, что важно помнить: «любит
          покороче на висках», «опаздывает».
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="flex gap-2 rounded-lg bg-muted/50 p-3">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line">{note.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {note.author} · {note.createdAt}
                </p>
              </div>
              {note.canDelete && (
                <ConfirmAction
                  title="Удалить заметку?"
                  description={note.text.slice(0, 120)}
                  action={() => removeNote(note.id)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Удалить заметку"
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
