"use client";
import { useRouter } from "next/navigation";
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
          {pending ? "Removing…" : "Remove from Blacklist"}
        </button>
      }
      title={`Remove ${name} from blacklist?`}
      description={`Customer ID: ${customerNumber ?? "—"}. Current reason: ${reason ?? "—"}. This preserves history and makes the customer eligible for booking again.`}
      confirmLabel="Confirm Removal"
      processingLabel="Removing…"
      onConfirm={remove}
    />
  );
}
