import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { rentals, vehicleDamageEvidence } from "@/db/schema";
import { can, getIdentity } from "@/lib/auth";
import { getPrivateCustomerDocument } from "@/lib/r2";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getIdentity();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
    return new Response("Not found", { status: 404 });
  const [evidence] = await db
    .select({
      key: vehicleDamageEvidence.objectKey,
      type: vehicleDamageEvidence.contentType,
      branchId: rentals.branchId,
    })
    .from(vehicleDamageEvidence)
    .innerJoin(rentals, eq(rentals.id, vehicleDamageEvidence.rentalId))
    .where(eq(vehicleDamageEvidence.id, id))
    .limit(1);
  if (!evidence) return new Response("Not found", { status: 404 });
  if (!can(actor, "rentals", "read", evidence.branchId))
    return new Response("Forbidden", { status: 403 });
  try {
    const object = await getPrivateCustomerDocument(evidence.key);
    if (!object.Body) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(await object.Body.transformToByteArray()), {
      headers: {
        "Content-Type": evidence.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Photo preview unavailable", { status: 502 });
  }
}
