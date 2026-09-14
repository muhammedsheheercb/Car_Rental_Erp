"use server";
import { redirect } from "next/navigation";
import { changePassword, requireIdentity } from "@/lib/auth";
import { passwordSchema } from "@/lib/validation";
export async function changePasswordAction(_: { error?: string }, formData: FormData) {
  const user = await requireIdentity();
  const input = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { error: "Use a new password of at least 12 characters." };
  if (input.data.currentPassword === input.data.newPassword)
    return { error: "Choose a different password." };
  if (!(await changePassword(user, input.data.currentPassword, input.data.newPassword)))
    return { error: "Your current password is incorrect." };
  redirect("/en/dashboard");
}
