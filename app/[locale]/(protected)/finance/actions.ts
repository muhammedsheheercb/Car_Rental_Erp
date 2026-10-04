"use server";
import { revalidatePath } from "next/cache";
import {
  approveRefund,
  changeLegalFine,
  correctPayment,
  recordFine,
  recordPayment,
} from "@/features/finance/service";
import { requireIdentity } from "@/lib/auth";
export async function financeAction(_previous: { error: string; message: string }, form: FormData) {
  const actor = await requireIdentity();
  const raw = Object.fromEntries(form);
  try {
    switch (raw.operation) {
      case "payment":
        await recordPayment(raw, actor);
        break;
      case "refund":
        await approveRefund(raw, actor);
        break;
      case "correction":
        await correctPayment(raw, actor);
        break;
      case "fine":
        await recordFine(raw, actor);
        break;
      case "edit":
      case "delete":
        await changeLegalFine(raw, actor);
        break;
      default:
        throw new Error("Unknown operation.");
    }
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name === "ZodError"
          ? "Check required fields, amounts and dates."
          : e instanceof Error && e.name !== "DrizzleQueryError"
            ? e.message
            : "Unable to save this record.",
      message: "",
    };
  }
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/finance`, "layout");
    revalidatePath(`/${locale}/rentals`, "layout");
  }
  return { error: "", message: "Saved successfully. History has been retained." };
}
