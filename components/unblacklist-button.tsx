"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { unblacklistCustomerAction } from "@/app/[locale]/(protected)/customers/actions";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";
export function UnblacklistButton({
  id,
  name,
  customerNumber,
  reason,
  onSuccess,
}: {
  id: string;
  name: string;
  customerNumber?: string;
  reason?: string | null;
  onSuccess?: () => void;
}) {
  const tCust = useTranslations("customers");
  const [pending, setPending] = useState(false);
  const { show } = useToast();
  const router = useRouter();
  const remove = async () => {
    setPending(true);
    try {
      const result = await unblacklistCustomerAction(id);
      show(result.message, result.ok ? "success" : "error", `unblacklist-${id}`);
      if (result.ok) {
        onSuccess?.();
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };
  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          disabled={pending}
          className="min-h-10 rounded-lg border border-[var(--edge)] px-2 text-sm text-[var(--accent)]"
        >
          {pending ? tCust("removing") : tCust("removeFromBlacklist")}
        </button>
      }
      title={tCust("removeBlacklistTitle", { name })}
      description={tCust("removeBlacklistDesc", {
        number: customerNumber ?? "—",
        reason: reason ?? "—",
      })}
      confirmLabel={tCust("confirmRemoval")}
      processingLabel={tCust("removing")}
      onConfirm={remove}
    />
  );
}
