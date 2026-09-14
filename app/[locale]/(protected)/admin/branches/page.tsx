import { desc } from "drizzle-orm";
import { BranchActions } from "@/components/branch-actions";
import { BranchCodePreview } from "@/components/branch-code-preview";
import { TrimmedForm } from "@/components/trimmed-form";
import { db } from "@/db/client";
import { branches } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { createBranchAction } from "../actions";
export default async function BranchesPage() {
  const actor = await requirePermission("branches", "read");
  const records = await db.select().from(branches).orderBy(desc(branches.createdAt));
  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0">
        <p className="text-sm text-[var(--accent)]">ADMINISTRATION</p>
        <h1 className="mt-2 text-3xl font-semibold">Branches</h1>
        <div className="mt-6 max-w-full overflow-x-auto rounded-2xl border border-[var(--edge)] [overscroll-behavior-inline:contain] sm:mt-8">
          <table className="min-w-[48rem] w-full text-start text-sm">
            <thead className="bg-[var(--raised)] text-[var(--muted)]">
              <tr>
                <th className="p-4">Branch</th>
                <th className="p-4">Location</th>
                <th className="p-4">Code</th>
                <th className="p-4">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((branch) => (
                <tr key={branch.id} className="border-t border-[var(--edge)]">
                  <td className="p-4 font-medium">{branch.name}</td>
                  <td className="p-4">{branch.location}</td>
                  <td className="p-4 font-mono">{branch.code}</td>
                  <td className="p-4">{branch.isActive ? "Active" : "Inactive"}</td>
                  <td className="p-2">
                    {branch.isActive && actor.role === "SUPER_ADMIN" && (
                      <BranchActions branch={branch} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!records.length && <p className="p-8 text-[var(--muted)]">No branches yet.</p>}
        </div>
      </section>
      {actor.role === "SUPER_ADMIN" && (
        <TrimmedForm
          action={createBranchAction}
          className="h-fit rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
        >
          <h2 className="font-semibold">New branch</h2>
          <BranchCodePreview />
          <label className="mt-4 block text-sm">
            Location
            <input
              name="location"
              required
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            />
          </label>
          <button
            type="submit"
            className="mt-6 min-h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-black"
          >
            Create branch
          </button>
        </TrimmedForm>
      )}
    </div>
  );
}
