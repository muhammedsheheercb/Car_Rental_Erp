"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { deleteBrandAction } from "@/app/[locale]/(protected)/fleet/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

export function BrandDeleteButton({ id }: { id: string }) {
  const tMaster = useTranslations("fleet.master");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const { show } = useToast();
  return (
    <ConfirmDialog
      title={tMaster("deleteBrandTitle")}
      description={tMaster("deleteBrandDesc")}
      confirmLabel={pending ? tCommon("deleting") : tCommon("delete")}
      onConfirm={() =>
        startTransition(async () => {
          const result = await deleteBrandAction(id);
          show(result.message, result.ok ? "success" : "error", `brand-delete:${id}`);
        })
      }
      trigger={
        <button type="button" disabled={pending} className="min-h-11 px-3 text-red-300">
          {pending ? tCommon("deleting") : tCommon("delete")}
        </button>
      }
    />
  );
}
