"use client";

import { useTransition } from "react";
import {
  deactivateBranchAction,
  deactivateUserAction,
} from "@/app/[locale]/(protected)/admin/actions";
import { ConfirmDialog } from "./confirm-dialog";

export function DeactivateButton({ entity, id }: { entity: "branch" | "user"; id: string }) {
  const [pending, startTransition] = useTransition();
  const branch = entity === "branch";
  return (
    <ConfirmDialog
      title={`Deactivate ${entity}?`}
      description={
        branch
          ? "Existing records remain intact, but this branch can no longer be used."
          : "They will be signed out and unable to access the system."
      }
      confirmLabel={pending ? "Deactivating…" : "Deactivate"}
      onConfirm={() =>
        startTransition(async () => {
          if (branch) await deactivateBranchAction(id);
          else await deactivateUserAction(id);
        })
      }
      trigger={
        <button type="button" className="min-h-11 px-3 text-red-300">
          Deactivate
        </button>
      }
    />
  );
}
