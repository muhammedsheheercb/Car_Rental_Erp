import { notFound } from "next/navigation";
import { PrintDocument } from "@/components/print-document";
import { loadDocument } from "@/features/documents/service";
import { requireIdentity } from "@/lib/auth";
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const actor = await requireIdentity();
  const { kind, id } = await params;
  const document = await loadDocument(kind, id, actor);
  if (!document) notFound();
  return <PrintDocument document={document} />;
}
