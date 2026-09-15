import { asc, eq, ilike, or, sql } from "drizzle-orm";
import Link from "next/link";
import { BrandDeleteButton } from "@/components/brand-delete-button";
import { BrandEditButton } from "@/components/brand-edit-button";
import { MasterSearch } from "@/components/master-search";
import { TrimmedForm } from "@/components/trimmed-form";
import { db } from "@/db/client";
import { vehicleBrands, vehicleModels } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { createBrandAction } from "../actions";
export default async function VehicleMaster({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requirePermission("fleet", "read");
  const { q = "", page = "1" } = await searchParams;
  const offset = Math.max(0, (Number(page) - 1) * 15);
  const filter = q
    ? or(ilike(vehicleBrands.name, `%${q}%`), ilike(vehicleModels.name, `%${q}%`))
    : undefined;
  const records = await db
    .select({
      id: vehicleBrands.id,
      name: vehicleBrands.name,
      active: vehicleBrands.isActive,
      models: sql<string>`string_agg(${vehicleModels.name}, ', ' order by ${vehicleModels.name})`,
    })
    .from(vehicleBrands)
    .leftJoin(vehicleModels, eq(vehicleModels.brandId, vehicleBrands.id))
    .where(filter)
    .groupBy(vehicleBrands.id)
    .orderBy(asc(vehicleBrands.name))
    .limit(15)
    .offset(offset);
  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-[var(--accent)]">FLEET MASTER</p>
            <h1 className="mt-2 text-3xl font-semibold">Vehicle brands & models</h1>
          </div>
          <Link
            href="/en/fleet/new"
            className="min-h-11 self-start rounded-lg bg-[var(--accent)] px-4 py-3 text-center text-sm font-semibold text-black"
          >
            Create vehicle
          </Link>
        </div>
        <div className="mt-6">
          <MasterSearch initialValue={q} />
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
                  Brand
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide"
                >
                  Models
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-2 py-3 text-center text-xs font-medium uppercase tracking-wide"
                >
                  Actions
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
                  <td className="break-words px-4 py-3 text-[var(--muted)]" title={brand.models}>
                    {brand.models}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs">
                      {brand.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    {brand.active && (
                      <div className="flex">
                        <BrandEditButton id={brand.id} name={brand.name} models={brand.models} />
                        <BrandDeleteButton id={brand.id} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && (
            <p className="p-8 text-[var(--muted)]">No vehicle brands match this search.</p>
          )}
        </div>
      </section>
      <TrimmedForm
        action={createBrandAction}
        className="h-fit rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
      >
        <h2 className="font-semibold">Add brand</h2>
        <label className="mt-4 block text-sm">
          Brand name
          <input
            required
            name="name"
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
          />
        </label>
        <label className="mt-4 block text-sm">
          Models <span className="text-[var(--muted)]">(one per line)</span>
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
          Save brand
        </button>
      </TrimmedForm>
    </div>
  );
}
