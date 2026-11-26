"use server";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { logout } from "@/lib/auth";
export async function logoutAction() {
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  await logout();
  redirect(`/${locale}/login`);
}
