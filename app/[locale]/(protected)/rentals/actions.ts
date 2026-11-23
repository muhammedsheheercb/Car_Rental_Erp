"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { rentals } from "@/db/schema";
import { deleteBooking, updateBooking } from "@/features/rentals/lifecycle";
import { activateRental, createReservation } from "@/features/rentals/service";
import { can, requireIdentity, requirePermission } from "@/lib/auth";
import { reservationSchema } from "@/lib/validation";

const uuidSchema = z.string().uuid();

function revalidateRentalPaths(id?: string) {
  for (const locale of ["en", "ar"]) {
    for (const page of ["rentals", "fleet", "dashboard"]) revalidatePath(`/${locale}/${page}`);
    if (id) revalidatePath(`/${locale}/rentals/${id}`);
    revalidatePath(`/${locale}/operations`, "layout");
  }
}

export async function createReservationAction(_previous: { error: string }, formData: FormData) {
  const locale = formData.get("locale") === "ar" ? "ar" : "en";
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
  revalidateRentalPaths();
  redirect(`/${locale}/rentals`);
}

export async function updateBookingAction(formData: FormData) {
  const actor = await requireIdentity();
  const id = String(formData.get("rentalId") ?? "");
  try {
    await updateBooking(Object.fromEntries(formData), actor);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name === "ZodError"
          ? "Check the booking fields and try again."
          : error instanceof Error && error.name !== "DrizzleQueryError"
            ? error.message
            : "Could not update booking.",
    };
  }
  revalidateRentalPaths(id);
  return { ok: true, message: "Booking updated successfully." };
}

export async function activateBookingAction(rentalId: string, startingKm: number) {
  const actor = await requireIdentity();
  if (!uuidSchema.safeParse(rentalId).success)
    return { ok: false, message: "Invalid booking identifier." };
  if (!Number.isInteger(startingKm) || startingKm < 0 || startingKm > 9_999_999)
    return { ok: false, message: "Enter a valid non-negative starting odometer reading." };
  try {
    const [rental] = await db.select().from(rentals).where(eq(rentals.id, rentalId)).limit(1);
    if (!rental || !can(actor, "rentals", "update", rental.branchId))
      return { ok: false, message: "You do not have permission to start this rental." };
    await activateRental(rentalId, startingKm, actor.id);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name !== "DrizzleQueryError"
          ? error.message
          : "Could not start rental.",
    };
  }
  revalidateRentalPaths(rentalId);
  return { ok: true, message: "Rental started (vehicle checked out)." };
}

export async function deleteBookingAction(rentalId: string) {
  const actor = await requireIdentity();
  try {
    await deleteBooking(rentalId, actor);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message === "FORBIDDEN"
          ? "You do not have permission to delete this booking."
          : error instanceof Error && error.name !== "DrizzleQueryError"
            ? error.message
            : "Could not delete booking.",
    };
  }
  revalidateRentalPaths(rentalId);
  return { ok: true, message: "Booking deleted successfully." };
}
