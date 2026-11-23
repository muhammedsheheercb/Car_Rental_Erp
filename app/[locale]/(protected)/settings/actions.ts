"use server";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { saveFleetAlerts } from "@/features/maintenance/settings";
import { saveSignature } from "@/features/signatures/service";
import { changePassword, requireIdentity } from "@/lib/auth";
import { settingsPasswordSchema, userPreferencesSchema } from "@/lib/validation";

const PREFS_COOKIE = "muscat_cars_prefs";

export async function settingsAction(_state: { error: string; message: string }, form: FormData) {
  const actor = await requireIdentity();
  const operation = form.get("operation");
  let successMessage = "Settings saved.";
  try {
    if (operation === "signature") {
      const file = form.get("signature");
      if (!(file instanceof File) || !file.size)
        throw new Error("Draw a signature, take a photo, or upload a signature image.");
      await saveSignature(Object.fromEntries(form), file, actor);
      successMessage = "Signature saved.";
    } else if (operation === "alerts") {
      await saveFleetAlerts(Object.fromEntries(form), actor);
      successMessage = "Fleet alert thresholds saved.";
    } else if (operation === "password") {
      const parsed = settingsPasswordSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ?? "Enter a valid current and new password.",
        );
      const updated = await changePassword(
        actor,
        parsed.data.currentPassword,
        parsed.data.newPassword,
      );
      if (!updated) throw new Error("Your current password is incorrect.");
      successMessage = "Password updated successfully.";
    } else if (operation === "preferences") {
      const parsed = userPreferencesSchema.safeParse(Object.fromEntries(form));
      if (!parsed.success) throw new Error("Select valid preference options.");
      const store = await cookies();
      store.set(PREFS_COOKIE, JSON.stringify(parsed.data), {
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 365 * 24 * 60 * 60,
      });
      successMessage = "Preferences saved.";
    } else {
      throw new Error("Unknown settings operation.");
    }
  } catch (e) {
    return {
      error:
        e instanceof Error && !["DrizzleQueryError", "ZodError"].includes(e.name)
          ? e.message
          : "Check the settings fields and try again.",
      message: "",
    };
  }
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/settings`);
    revalidatePath(`/${locale}/settings/signature`);
    revalidatePath(`/${locale}/dashboard`);
    revalidatePath(`/${locale}/near-to-service`);
    revalidatePath(`/${locale}/expiry`);
    revalidatePath(`/${locale}/documents`, "layout");
  }
  return { error: "", message: successMessage };
}
