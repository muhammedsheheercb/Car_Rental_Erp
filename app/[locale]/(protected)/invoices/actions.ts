"use server";
import { revalidatePath } from "next/cache";
import { saveInvoice, voidInvoice } from "@/features/invoices/service";
import { requireIdentity } from "@/lib/auth";
export async function invoiceAction(_state: { error: string; message: string }, form: FormData) {
  const actor = await requireIdentity();
  try {
    if (form.get("operation") === "void") await voidInvoice(Object.fromEntries(form), actor);
    else await saveInvoice(Object.fromEntries(form), actor);
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name !== "DrizzleQueryError" && e.name !== "ZodError"
          ? e.message
          : "Check the invoice fields and try again.",
      message: "",
    };
  }
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/invoices`, "layout");
    revalidatePath(`/${locale}/rentals`, "layout");
    revalidatePath(`/${locale}/finance`, "layout");
  }
  return { error: "", message: "Invoice saved. Financial history retained." };
}
