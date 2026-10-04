"use server";
import { revalidatePath } from "next/cache";
import { changeService, createService } from "@/features/maintenance/service";
import { requireIdentity } from "@/lib/auth";
export async function serviceAction(_state: { error: string; message: string }, form: FormData) {
  const actor = await requireIdentity();
  try {
    if (form.get("operation") === "update") await changeService(Object.fromEntries(form), actor);
    else await createService(Object.fromEntries(form), actor);
  } catch (e) {
    return {
      error:
        e instanceof Error && !["DrizzleQueryError", "ZodError"].includes(e.name)
          ? e.message
          : "Check service fields and try again.",
      message: "",
    };
  }
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/service`);
    revalidatePath(`/${locale}/near-to-service`);
    revalidatePath(`/${locale}/fleet`);
    revalidatePath(`/${locale}/operations`, "layout");
    revalidatePath(`/${locale}/dashboard`);
    revalidatePath(`/${locale}/transfers`);
  }
  return { error: "", message: "Service saved. History retained." };
}
