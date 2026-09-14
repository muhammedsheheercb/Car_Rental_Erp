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
          <table className="min-w-[42rem] w-full text-start text-sm">
            <thead className="bg-[var(--raised)] text-[var(--muted)]">
              <tr>
                <th className="p-4">Brand</th>
                <th className="p-4">Models</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((brand) => (
                <tr key={brand.id} className="border-t border-[var(--edge)]">
                  <td className="p-4 font-medium">{brand.name}</td>
                  <td className="p-4 text-[var(--muted)]">{brand.models}</td>
                  <td className="p-4">{brand.active ? "Active" : "Inactive"}</td>
                  <td className="p-2">
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
