"use server";
import { redirect } from "next/navigation";
import { login } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
export async function loginAction(_: { error?: string }, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid username and password." };
  const result = await login(parsed.data.username, parsed.data.password);
  if (!result.ok) return { error: result.error };
  redirect(result.mustChangePassword ? "/en/change-password" : "/en/dashboard");
}
