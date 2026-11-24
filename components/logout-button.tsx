"use client";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { logoutAction } from "@/app/[locale]/(protected)/actions";
import { ConfirmDialog } from "./confirm-dialog";
export function LogoutButton() {
  const tAuth = useTranslations("auth");
  const tNav = useTranslations("nav");
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      title={tAuth("logoutTitle")}
      description={tAuth("logoutDescription")}
      confirmLabel={pending ? tAuth("loggingOut") : tNav("logout")}
      onConfirm={() => startTransition(() => logoutAction())}
      trigger={
        <button
          type="button"
          className="min-h-11 shrink-0 whitespace-nowrap rounded-lg px-1 text-xs text-[var(--muted)] sm:px-2 sm:text-sm"
        >
          {tNav("logout")}
        </button>
      }
    />
  );
}
