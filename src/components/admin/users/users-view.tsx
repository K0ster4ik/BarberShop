"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Lock, Pencil, Plus } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { PageHeader } from "@/components/admin/page-header";
import { FormDialog } from "@/components/forms/dialogs";
import {
  FormSubmit,
  SelectField,
  SwitchField,
  TextField,
} from "@/components/forms/fields";
import { submitAction } from "@/components/forms/submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { Role } from "@/generated/prisma/enums";
import {
  type PasswordResetInput,
  passwordResetSchema,
  type UserCreateInput,
  userCreateSchema,
  type UserUpdateInput,
  userUpdateSchema,
} from "@/lib/validation/users";
import {
  createStaff,
  resetStaffPassword,
  updateStaff,
} from "@/server/users/actions";

export type UserItem = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  master: { id: string; name: string } | null;
  isSelf: boolean;
  demoLocked: boolean;
};

export type MasterOption = { id: string; name: string; userId: string | null };

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Владелец" },
  { value: "ADMIN", label: "Администратор" },
  { value: "MASTER", label: "Мастер" },
];
const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Владелец",
  ADMIN: "Администратор",
  MASTER: "Мастер",
};

export function UsersView({
  users,
  masters,
  demoMode,
}: {
  users: UserItem[];
  masters: MasterOption[];
  demoMode: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Пользователи"
        description="Сотрудники с доступом в CRM. Самостоятельной регистрации нет — учётные записи создаёт владелец."
        actions={
          <FormDialog
            title="Новый сотрудник"
            trigger={
              <Button>
                <Plus aria-hidden /> Сотрудник
              </Button>
            }
          >
            {(close) => <CreateUserForm masters={masters} onDone={close} />}
          </FormDialog>
        }
      />
      {demoMode && (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Демо-режим: общие демо-учётки защищены от изменений, а добавленные
          сотрудники удаляются при ежечасном сбросе демо.
        </p>
      )}
      <ul className="divide-y rounded-lg border">
        {users.map((user) => (
          <li key={user.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{user.name}</span>
                {user.isSelf && (
                  <span className="text-sm text-muted-foreground">(вы)</span>
                )}
                <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
                {!user.isActive && <Badge variant="outline">Отключён</Badge>}
                {user.demoLocked && (
                  <Badge variant="outline">
                    <Lock aria-hidden /> Демо-учётка
                  </Badge>
                )}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
                {user.master && ` · карточка: ${user.master.name}`}
              </p>
            </div>
            {/* Демо-учётки защищены: вместо неактивных кнопок — только отметка с замком. */}
            {!user.demoLocked && (
              <>
                <FormDialog
                  title={user.name}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Изменить: ${user.name}`}
                    >
                      <Pencil aria-hidden />
                    </Button>
                  }
                >
                  {(close) => (
                    <EditUserForm
                      user={user}
                      masters={masters}
                      onDone={close}
                    />
                  )}
                </FormDialog>
                <FormDialog
                  title="Новый пароль"
                  description={`Для ${user.name}. Сотрудник выйдет со всех устройств и войдёт с новым паролем.`}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Сменить пароль: ${user.name}`}
                    >
                      <KeyRound aria-hidden />
                    </Button>
                  }
                >
                  {(close) => <PasswordForm userId={user.id} onDone={close} />}
                </FormDialog>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Свободные карточки мастеров и та, что уже принадлежит сотруднику. */
function masterOptions(masters: MasterOption[], userId?: string) {
  return masters
    .filter((master) => master.userId === null || master.userId === userId)
    .map((master) => ({ value: master.id, label: master.name }));
}

function CreateUserForm({
  masters,
  onDone,
}: {
  masters: MasterOption[];
  onDone: () => void;
}) {
  const form = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: {
      name: "",
      email: "",
      role: "ADMIN",
      password: "",
      masterId: "",
    },
  });
  const role = useWatch({ control: form.control, name: "role" });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () => createStaff(values));
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Имя и фамилия" />
        <TextField
          control={form.control}
          name="email"
          label="Email"
          type="email"
          autoComplete="off"
        />
        <SelectField
          control={form.control}
          name="role"
          label="Роль"
          options={ROLE_OPTIONS}
        />
        {role === "MASTER" && (
          <SelectField
            control={form.control}
            name="masterId"
            label="Карточка мастера"
            placeholder="Выберите мастера"
            options={masterOptions(masters)}
            description="Мастер увидит в CRM только свои записи и клиентов."
          />
        )}
        <TextField
          control={form.control}
          name="password"
          label="Пароль"
          type="password"
          autoComplete="new-password"
          description="Не меньше 8 символов. Передайте его сотруднику лично."
        />
        <FormSubmit pending={form.formState.isSubmitting}>Добавить</FormSubmit>
      </FieldGroup>
    </form>
  );
}

function EditUserForm({
  user,
  masters,
  onDone,
}: {
  user: UserItem;
  masters: MasterOption[];
  onDone: () => void;
}) {
  const form = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: {
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      masterId: user.master?.id ?? "",
    },
  });
  const role = useWatch({ control: form.control, name: "role" });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          updateStaff(user.id, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <TextField control={form.control} name="name" label="Имя и фамилия" />
        <SelectField
          control={form.control}
          name="role"
          label="Роль"
          options={ROLE_OPTIONS}
        />
        {role === "MASTER" && (
          <SelectField
            control={form.control}
            name="masterId"
            label="Карточка мастера"
            placeholder="Выберите мастера"
            options={masterOptions(masters, user.id)}
          />
        )}
        <SwitchField
          control={form.control}
          name="isActive"
          label="Доступ в CRM"
          description="Отключённый сотрудник сразу выходит со всех устройств."
        />
        <FormSubmit pending={form.formState.isSubmitting}>Сохранить</FormSubmit>
      </FieldGroup>
    </form>
  );
}

function PasswordForm({
  userId,
  onDone,
}: {
  userId: string;
  onDone: () => void;
}) {
  const form = useForm<PasswordResetInput>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: { password: "" },
  });

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async (values) => {
        const result = await submitAction(form, () =>
          resetStaffPassword(userId, values),
        );
        if (result?.ok) onDone();
      })}
    >
      <FieldGroup>
        <TextField
          control={form.control}
          name="password"
          label="Новый пароль"
          type="password"
          autoComplete="new-password"
        />
        <FormSubmit pending={form.formState.isSubmitting}>
          Сменить пароль
        </FormSubmit>
      </FieldGroup>
    </form>
  );
}
