"use server";
import { revalidatePath } from "next/cache";
import { swapVehicle } from "@/features/transfers/service";
import { requireIdentity } from "@/lib/auth";
export async function transferAction(_state: { error: string; message: string }, form: FormData) {
  const actor = await requireIdentity();
  try {
    await swapVehicle(Object.fromEntries(form), actor);
  } catch (e) {
    return {
      error:
        e instanceof Error && e.name !== "DrizzleQueryError" && e.name !== "ZodError"
          ? e.message
          : "Check the transfer fields and try again.",
      message: "",
    };
  }
  for (const locale of ["en", "ar"]) {
    revalidatePath(`/${locale}/transfers`);
    revalidatePath(`/${locale}/rentals`, "layout");
    revalidatePath(`/${locale}/fleet`);
    revalidatePath(`/${locale}/operations`, "layout");
    revalidatePath(`/${locale}/invoices`, "layout");
  }
  return { error: "", message: "Vehicle transferred. Booking and payment history retained." };
}
