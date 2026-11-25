"use client";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { translateValidation } from "@/lib/i18n-helpers";
import { changePasswordAction } from "./actions";
export default function ChangePasswordPage() {
  const t = useTranslations();
  const tAuth = useTranslations("auth");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(changePasswordAction, { error: "" });
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <form
        action={action}
        className="w-full max-w-sm rounded-3xl border border-[var(--edge)] bg-[var(--surface)] p-7"
      >
        <p className="text-xs font-semibold tracking-[.2em] text-[var(--accent-ink)]">
          {tAuth("securityRequired")}
        </p>
        <h1 className="mt-4 text-3xl font-semibold">{tAuth("setPasswordTitle")}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{tAuth("setPasswordSubtitle")}</p>
        <label className="mt-6 block text-sm">
          {tAuth("currentPassword")}
          <input
            required
            name="currentPassword"
            type="password"
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
          />
        </label>
        <label className="mt-4 block text-sm">
          {tAuth("newPassword")}
          <input
            required
            name="newPassword"
            minLength={12}
            type="password"
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
          />
        </label>
        {state.error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {translateValidation(t, state.error)}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-6 min-h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-black"
        >
          {pending ? tCommon("saving") : tAuth("secureAccount")}
        </button>
      </form>
    </main>
  );
}
