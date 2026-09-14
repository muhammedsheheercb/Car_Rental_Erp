"use client";
import { useTransition } from "react";
import { logoutAction } from "@/app/[locale]/(protected)/actions";
import { ConfirmDialog } from "./confirm-dialog";
export function LogoutButton() {
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      title="Log out?"
      description="You will need to sign in again to continue."
      confirmLabel={pending ? "Logging out…" : "Log out"}
      onConfirm={() => startTransition(() => logoutAction())}
      trigger={
        <button
          type="button"
          className="min-h-11 rounded-lg px-1 text-xs text-[var(--muted)] sm:px-3 sm:text-sm"
        >
          Log out
        </button>
      }
    />
  );
}
