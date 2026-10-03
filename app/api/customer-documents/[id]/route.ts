import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { customerDocuments } from "@/db/schema";
import { can, getIdentity } from "@/lib/auth";
import { getPrivateCustomerDocument } from "@/lib/r2";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity();
  if (!identity) return new Response("Unauthorized", { status: 401 });
  if (!can(identity, "customers", "read")) return new Response("Forbidden", { status: 403 });
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return new Response("Document not found", { status: 404 });
  const [document] = await db
    .select()
    .from(customerDocuments)
    .where(eq(customerDocuments.id, id))
    .limit(1);
  if (!document) return new Response("Document not found", { status: 404 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(document.contentType))
    return new Response("Unsupported document", { status: 415 });
  try {
    const object = await getPrivateCustomerDocument(document.objectKey);
    if (!object.Body) return new Response("Document not found", { status: 404 });
    return new Response(new Uint8Array(await object.Body.transformToByteArray()), {
      headers: {
        "Content-Type": document.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Document preview unavailable", { status: 502 });
  }
}
