"use client";

import { useState, useTransition } from "react";
import { updateBrandAction } from "@/app/[locale]/(protected)/fleet/actions";
import { useToast } from "./toast";

export function BrandEditButton({
  id,
  name,
  models,
}: {
  id: string;
  name: string;
  models: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { show } = useToast();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 px-3 text-[var(--accent)]"
      >
        Edit
      </button>
      {open && (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/70 sm:place-items-center sm:p-4">
          <form
            action={(formData) =>
              startTransition(async () => {
                const result = await updateBrandAction(id, {
                  name: String(formData.get("name") ?? "").trim(),
                  models: String(formData.get("models") ?? "")
                    .split("\n")
                    .map((value) => value.trim())
                    .filter(Boolean),
                });
                show(result.message, result.ok ? "success" : "error", `brand-update:${id}`);
                if (result.ok) setOpen(false);
              })
            }
            className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--raised)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6"
          >
            <h2 className="text-lg font-semibold">Edit brand</h2>
            <label className="mt-4 block text-sm">
              Brand name
              <input
                required
                name="name"
                defaultValue={name}
                className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
              />
            </label>
            <label className="mt-4 block text-sm">
              Models (one per line)
              <textarea
                required
                name="models"
                defaultValue={models.split(", ").join("\n")}
                className="mt-2 min-h-28 w-full rounded-lg border border-[var(--edge)] bg-black/20 p-3"
              />
            </label>
            <div className="mt-6 flex flex-col-reverse gap-3 min-[360px]:flex-row min-[360px]:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
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
    </>
  );
}
