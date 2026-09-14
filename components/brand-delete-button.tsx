"use client";

import { useTransition } from "react";
import { deleteBrandAction } from "@/app/[locale]/(protected)/fleet/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

export function BrandDeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const { show } = useToast();
  return (
    <ConfirmDialog
      title="Delete brand?"
      description="Brands connected to vehicles cannot be deleted; choose deactivate if you want to retain historical records."
      confirmLabel={pending ? "Deleting…" : "Delete"}
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteBrandAction(id);
          show(result.message, result.ok ? "success" : "error", `brand-delete:${id}`);
        })
      }
      trigger={
        <button type="button" disabled={pending} className="min-h-11 px-3 text-red-300">
          {pending ? "Deleting…" : "Delete"}
        </button>
      }
    />
  );
}
