"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createReservation } from "@/features/rentals/service";
import { requirePermission } from "@/lib/auth";
import { reservationSchema } from "@/lib/validation";

export async function createReservationAction(_previous: { error: string }, formData: FormData) {
  try {
    const actor = await requirePermission("rentals", "create", String(formData.get("branchId")));
    const parsed = reservationSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success)
      return { error: parsed.error.issues[0]?.message ?? "Check the reservation details." };
    // The service owns parsing and return-date calculation; never trust a client-computed total.
    await createReservation(Object.fromEntries(formData), actor);
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Could not create reservation." };
  }
  for (const locale of ["en", "ar"])
    for (const page of ["rentals", "fleet", "dashboard"]) revalidatePath(`/${locale}/${page}`);
  redirect("/en/rentals");
}
