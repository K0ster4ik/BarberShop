"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LOGIN_PATH } from "@/server/auth/access";

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect(LOGIN_PATH);
}
