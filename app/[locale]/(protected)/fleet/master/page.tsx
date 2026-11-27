import { asc, eq, ilike, or, sql } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandDeleteButton } from "@/components/brand-delete-button";
import { BrandEditButton } from "@/components/brand-edit-button";
import { MasterSearch } from "@/components/master-search";
import { TrimmedForm } from "@/components/trimmed-form";
import { db } from "@/db/client";
import { vehicleBrands, vehicleModels } from "@/db/schema";
import { can, requirePagePermission } from "@/lib/auth";
import { createBrandAction } from "../actions";
export default async function VehicleMaster({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  const actor = await requirePagePermission(locale, "fleet", "read");
  const [{ q = "", page = "1" }, tMaster, tFleet, tCommon, tStatus] = await Promise.all([
    searchParams,
    getTranslations("fleet.master"),
    getTranslations("fleet"),
    getTranslations("common"),
    getTranslations("status"),
  ]);
  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const offset = (currentPage - 1) * 15;
  const filter = q
    ? or(ilike(vehicleBrands.name, `%${q}%`), ilike(vehicleModels.name, `%${q}%`))
    : undefined;
  const [records, totalRows] = await Promise.all([
    db
      .select({
        id: vehicleBrands.id,
        name: vehicleBrands.name,
        active: vehicleBrands.isActive,
        models: sql<string>`coalesce(string_agg(${vehicleModels.name}, ', ' order by ${vehicleModels.name}), '')`,
      })
      .from(vehicleBrands)
      .leftJoin(vehicleModels, eq(vehicleModels.brandId, vehicleBrands.id))
      .where(filter)
      .groupBy(vehicleBrands.id)
      .orderBy(asc(vehicleBrands.name))
      .limit(15)
      .offset(offset),
    db
      .select({ total: sql<number>`count(distinct ${vehicleBrands.id})::int` })
      .from(vehicleBrands)
      .leftJoin(vehicleModels, eq(vehicleModels.brandId, vehicleBrands.id))
      .where(filter),
  ]);
  const total = Number(totalRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / 15));
  const pageHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("page", String(nextPage));
    return `/${locale}/fleet/master?${p.toString()}`;
  };
  const canCreate = can(actor, "fleet", "create");
  const canUpdate = can(actor, "fleet", "update");
  const canDelete = can(actor, "fleet", "delete");
  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-[var(--accent)]">{tMaster("eyebrow")}</p>
            <h1 className="mt-2 text-3xl font-semibold">{tMaster("title")}</h1>
          </div>
          {canCreate && (
            <Link
              href={`/${locale}/fleet/new`}
              className="min-h-11 self-start rounded-lg bg-[var(--accent)] px-4 py-3 text-center text-sm font-semibold text-black"
            >
              {tFleet("createVehicle")}
            </Link>
          )}
        </div>
        <div className="mt-6">
          <MasterSearch initialValue={q} placeholder={tMaster("searchPlaceholder")} />
        </div>
        <div className="mt-5 max-w-full overflow-x-auto rounded-2xl border border-[var(--edge)] [overscroll-behavior-inline:contain]">
          <table className="min-w-[42rem] w-full table-fixed text-start text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[42%]" />
              <col className="w-[16%]" />
              <col className="w-[11rem]" />
            </colgroup>
            <thead className="bg-[var(--raised)] text-[var(--muted)]">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
                >
                  {tMaster("brand")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
                >
                  {tMaster("models")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide"
                >
                  {tCommon("status")}
                </th>
                <th
                  scope="col"
                  className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide"
                >
                  {tCommon("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((brand) => (
                <tr
                  key={brand.id}
                  className="border-t border-[var(--edge)] align-middle hover:bg-white/5"
                >
                  <td className="break-words px-4 py-3 font-medium">{brand.name}</td>
                  <td
                    className="break-words px-4 py-3 text-[var(--muted)]"
                    title={brand.models || "—"}
                  >
                    {brand.models || "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs">
                      {brand.active ? tStatus("ACTIVE") : tStatus("INACTIVE")}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {brand.active && (canUpdate || canDelete) && (
                      <div className="flex justify-center">
                        {canUpdate && (
                          <BrandEditButton id={brand.id} name={brand.name} models={brand.models} />
                        )}
                        {canDelete && <BrandDeleteButton id={brand.id} />}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && <p className="p-8 text-[var(--muted)]">{tMaster("noBrands")}</p>}
        </div>
        {total > 15 && (
          <nav
            aria-label={tMaster("title")}
            className="mt-4 flex items-center justify-end gap-3 text-sm"
          >
            {currentPage > 1 && (
              <Link
                href={pageHref(currentPage - 1) as never}
                className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
              >
                {tCommon("previous")}
              </Link>
            )}
            <span className="text-[var(--muted)]">
              {tCommon("pageOf", { page: currentPage, total: totalPages })}
            </span>
            {currentPage < totalPages && (
              <Link
                href={pageHref(currentPage + 1) as never}
                className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3"
              >
                {tCommon("next")}
              </Link>
            )}
          </nav>
        )}
      </section>
      {canCreate && (
        <TrimmedForm
          action={createBrandAction}
          className="h-fit rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
        >
          <h2 className="font-semibold">{tMaster("addBrand")}</h2>
          <label className="mt-4 block text-sm">
            {tMaster("brandName")}
            <input
              required
              name="name"
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            />
          </label>
          <label className="mt-4 block text-sm">
            {tMaster("modelsOnePerLine")}
            <textarea
              required
              name="models"
              placeholder="Camry&#10;Corolla"
              className="mt-2 min-h-28 w-full rounded-lg border border-[var(--edge)] bg-black/20 p-3"
            />
          </label>
          <button
            type="submit"
            className="mt-5 min-h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-black"
          >
            {tMaster("saveBrand")}
          </button>
        </TrimmedForm>
      )}
    </div>
  );
}
