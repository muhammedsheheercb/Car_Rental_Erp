import { formatReportCsvFilename, serializeReportCsv } from "@/features/reports/definitions";
import { loadReport } from "@/features/reports/service";
import { can, getIdentity } from "@/lib/auth";

export async function GET(request: Request) {
  const actor = await getIdentity();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (!can(actor, "reports", "read") || !can(actor, "reports", "export")) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const sp = url.searchParams;
  const locale = sp.get("locale") === "ar" ? "ar" : "en";

  const data = await loadReport(
    actor,
    locale,
    {
      report: sp.get("report") ?? undefined,
      q: sp.get("q") ?? undefined,
      branchId: sp.get("branchId") ?? undefined,
      status: sp.get("status") ?? undefined,
      paymentMode: sp.get("paymentMode") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
    },
    "export",
  );

  const csv = serializeReportCsv(data.columns, data.rows);
  const filename = formatReportCsvFilename(data.definition.slug);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
