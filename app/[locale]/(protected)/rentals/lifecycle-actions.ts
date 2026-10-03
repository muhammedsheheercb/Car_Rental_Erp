"use server";
import { revalidatePath } from "next/cache";
import {
  cancelAgreement,
  extendContract,
  recordDamage,
  returnContract,
} from "@/features/rentals/lifecycle";
import { activateRental } from "@/features/rentals/service";
import { can, requireIdentity } from "@/lib/auth";

async function refresh(id: string) {
  for (const locale of ["en", "ar"]) {
    for (const page of ["rentals", "fleet", "dashboard", `rentals/${id}`])
      revalidatePath(`/${locale}/${page}`);
    revalidatePath(`/${locale}/operations`, "layout");
  }
}
export async function rentalLifecycleAction(
  _previous: { error: string; message: string },
  form: FormData,
) {
  const actor = await requireIdentity();
  const input = Object.fromEntries(form);
  const id = String(form.get("rentalId"));
  try {
    switch (form.get("operation")) {
      case "extend":
        await extendContract(input, actor);
        break;
      case "cancel":
        await cancelAgreement(input, actor);
        break;
      case "damage": {
        const file = form.get("photo");
        if (!(file instanceof File)) throw new Error("A photo is required.");
        await recordDamage(input, file, actor);
        break;
      }
      case "return":
        await returnContract(
          {
            rentalId: id,
            returnedAt: String(form.get("returnedAt")),
            endingKm: String(form.get("endingKm")),
          },
          actor,
        );
        break;
      case "checkout": {
        const { db } = await import("@/db/client");
        const { rentals } = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const [rental] = await db.select().from(rentals).where(eq(rentals.id, id)).limit(1);
        if (!rental || !can(actor, "rentals", "update", rental.branchId))
          throw new Error("Access denied.");
        await activateRental(id, Number(form.get("startingKm")), actor.id);
        break;
      }
      default:
        throw new Error("Unknown agreement action.");
    }
  } catch (error) {
    if (error instanceof Error && "digest" in error) throw error;
    return {
      message: "",
      error:
        error instanceof Error && error.name === "ZodError"
          ? "Check the required fields and values."
          : error instanceof Error && error.name !== "DrizzleQueryError"
            ? error.message
            : "Could not save the agreement change.",
    };
  }
  await refresh(id);
  return { error: "", message: "Agreement updated successfully." };
}
