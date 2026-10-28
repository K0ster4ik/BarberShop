import { notFound, redirect } from "next/navigation";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NETWORK_ERROR,
  runWithToast,
  submitAction,
} from "@/components/forms/submit";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(toast.error).mockClear();
});

function thrown(fn: () => never): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
}

function fakeForm() {
  return {
    control: {},
    setError: vi.fn(),
  } as unknown as UseFormReturn<{ name: string }>;
}

describe("submitAction", () => {
  it("sends a form once even if it is submitted twice before the first reply", async () => {
    const form = fakeForm();
    let release = () => {};
    const call = vi.fn(
      () =>
        new Promise<{ ok: true; data: null }>((resolve) => {
          release = () => resolve({ ok: true, data: null });
        }),
    );

    const first = submitAction(form, call);
    const second = submitAction(form, call);
    release();

    expect(await second).toBeNull();
    expect(await first).toEqual({ ok: true, data: null });
    expect(call).toHaveBeenCalledTimes(1);

    // После ответа форму снова можно отправить
    const third = submitAction(form, call);
    release();
    await third;
    expect(call).toHaveBeenCalledTimes(2);
  });
});

describe("runWithToast", () => {
  it("reports a failed request as a network problem", async () => {
    await expect(
      runWithToast(() => Promise.reject(new TypeError("Failed to fetch"))),
    ).resolves.toBeNull();
    expect(toast.error).toHaveBeenCalledWith(NETWORK_ERROR);
  });

  it("stays quiet when the action redirected or denied access", async () => {
    // Роутер Next.js сам уводит на вход или показывает «Нет доступа» —
    // тост про обрыв сети здесь был бы неправдой.
    for (const error of [
      thrown(() => redirect("/admin/login")),
      thrown(() => notFound()),
    ]) {
      await expect(
        runWithToast(() => Promise.reject(error)),
      ).resolves.toBeNull();
    }
    expect(toast.error).not.toHaveBeenCalled();
  });
});
