"use client";

import { useState, useTransition } from "react";
import {
  deactivateBranchAction,
  deleteBranchAction,
  updateBranchAction,
} from "@/app/[locale]/(protected)/admin/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

type Branch = { id: string; name: string; location: string; code: string };
export function BranchActions({ branch }: { branch: Branch }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { show } = useToast();
  const run = (operation: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const result = await operation();
      show(
        result.message,
        result.ok ? "success" : "error",
        `branch:${branch.id}:${result.message}`,
      );
      if (result.ok) setEditing(false);
    });
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => setEditing(true)}
        className="min-h-11 px-3 text-sm text-[var(--accent)]"
      >
        Edit
      </button>
      <ConfirmDialog
        title={`Delete ${branch.name}?`}
        description="This permanently removes the branch only when no records reference it."
        confirmLabel={pending ? "Deleting…" : "Delete"}
        onConfirm={() => run(() => deleteBranchAction(branch.id))}
        trigger={
          <button type="button" disabled={pending} className="min-h-11 px-3 text-sm text-red-300">
            {pending ? "Deleting…" : "Delete"}
          </button>
        }
      />
      <ConfirmDialog
        title={`Deactivate ${branch.name}?`}
        description="The branch remains in historical records but cannot be used for new operations."
        confirmLabel={pending ? "Deactivating…" : "Deactivate"}
        onConfirm={() => run(() => deactivateBranchAction(branch.id))}
        trigger={
          <button
            type="button"
            disabled={pending}
            className="min-h-11 px-3 text-sm text-[var(--muted)]"
          >
            Deactivate
          </button>
        }
      />
      {editing && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 sm:place-items-center sm:p-4">
          <form
            action={(formData) => run(() => updateBranchAction(branch.id, formData))}
            className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--edge)] bg-[var(--raised)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6"
          >
            <h2 className="text-lg font-semibold">Edit branch</h2>
            <label className="mt-4 block text-sm">
              Name
              <input
                required
                name="name"
                defaultValue={branch.name}
                className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
              />
            </label>
            <label className="mt-4 block text-sm">
              Location
              <input
                required
                name="location"
                defaultValue={branch.location}
                className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
              />
            </label>
            <label className="mt-4 block text-sm">
              Branch code
              <input
                value={branch.code}
                disabled
                className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/40 px-3 font-mono text-[var(--muted)]"
              />
            </label>
            <input type="hidden" name="code" value={branch.code} />
            <div className="mt-6 flex flex-col-reverse gap-3 min-[360px]:flex-row min-[360px]:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(false)}
                className="min-h-11 px-4"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="min-h-11 rounded-lg bg-[var(--accent)] px-4 font-semibold text-black"
              >
                {pending ? "Updating…" : "Update"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
