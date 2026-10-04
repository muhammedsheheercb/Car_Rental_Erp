"use server";
import { revalidatePath } from "next/cache";
import { saveFleetAlerts } from "@/features/maintenance/settings";
import { saveSignature } from "@/features/signatures/service";
import { requireIdentity } from "@/lib/auth";
export async function settingsAction(_state: { error: string; message: string }, form: FormData) {
  const actor = await requireIdentity();
  try {
    if (form.get("operation") === "signature") {
      const file = form.get("signature");
      if (!(file instanceof File) || !file.size)
        throw new Error("Take a photo or upload a signature.");
      await saveSignature(Object.fromEntries(form), file, actor);
    } else if (form.get("operation") === "alerts")
      await saveFleetAlerts(Object.fromEntries(form), actor);
    else throw new Error("Unknown settings operation.");
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
    revalidatePath(`/${locale}/near-to-service`);
    revalidatePath(`/${locale}/expiry`);
    revalidatePath(`/${locale}/documents`, "layout");
  }
  return { error: "", message: "Settings saved." };
}
