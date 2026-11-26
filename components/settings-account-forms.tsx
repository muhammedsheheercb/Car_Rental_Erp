"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { settingsAction } from "@/app/[locale]/(protected)/settings/actions";
import { translateValidation } from "@/lib/i18n-helpers";

export function ChangePasswordForm() {
  const t = useTranslations();
  const tSettings = useTranslations("settings");
  const tAuth = useTranslations("auth");
  const tAdmin = useTranslations("admin");
  const [state, action, pending] = useActionState(settingsAction, { error: "", message: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.message) {
      formRef.current?.reset();
    }
  }, [state.message]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
    >
      <input type="hidden" name="operation" value="password" />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{tSettings("changePasswordTitle")}</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{tSettings("changePasswordNote")}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPasswords((v) => !v)}
          className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-xs text-[var(--muted)]"
        >
          {showPasswords ? tSettings("hidePasswords") : tSettings("showPasswords")}
        </button>
      </div>

      <label className="block text-sm">
        {tAuth("currentPassword")}
        <input
          name="currentPassword"
          type={showPasswords ? "text" : "password"}
          autoComplete="current-password"
          required
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          {tAuth("newPassword")}
          <input
            name="newPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            placeholder={tAdmin("minPasswordPlaceholder")}
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
          />
        </label>
        <label className="block text-sm">
          {tAuth("confirmPassword")}
          <input
            name="confirmPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            placeholder={tSettings("repeatPasswordPlaceholder")}
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
          />
        </label>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {translateValidation(t, state.error)}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-[var(--accent)]">
          {translateValidation(t, state.message)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? tSettings("updatingPassword") : tSettings("updatePassword")}
      </button>
    </form>
  );
}

export function PreferencesForm({
  locale,
  initialPreferences,
}: {
  locale: string;
  initialPreferences: {
    tableDensity: "comfortable" | "compact";
    dateFormat: "DMY" | "YMD";
  };
}) {
  const t = useTranslations();
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(settingsAction, { error: "", message: "" });

  return (
    <section className="grid gap-5 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
      <div>
        <h2 className="text-lg font-semibold">{tSettings("languagePrefsTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{tSettings("languagePrefsSubtitle")}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{tSettings("interfaceLanguage")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={"/en/settings" as never}
            aria-current={locale === "en" ? "page" : undefined}
            className={`min-h-11 rounded-xl border p-3 text-sm ${locale === "en" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-[var(--edge)] text-[var(--muted)] hover:text-white"}`}
          >
            <p className="font-semibold">English</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{tSettings("ltrLabel")}</p>
          </Link>
          <Link
            href={"/ar/settings" as never}
            aria-current={locale === "ar" ? "page" : undefined}
            className={`min-h-11 rounded-xl border p-3 text-sm ${locale === "ar" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-[var(--edge)] text-[var(--muted)] hover:text-white"}`}
          >
            <p className="font-semibold">العربية</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">{tSettings("rtlLabel")}</p>
          </Link>
        </div>
      </div>

      <form action={action} className="grid gap-4 border-t border-[var(--edge)] pt-4">
        <input type="hidden" name="operation" value="preferences" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            {tSettings("tableDensity")}
            <select
              name="tableDensity"
              defaultValue={initialPreferences.tableDensity}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            >
              <option value="comfortable">{tSettings("comfortable")}</option>
              <option value="compact">{tSettings("compact")}</option>
            </select>
          </label>
          <label className="block text-sm">
            {tSettings("dateDisplay")}
            <select
              name="dateFormat"
              defaultValue={initialPreferences.dateFormat}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            >
              <option value="DMY">{tSettings("dmyLabel")}</option>
              <option value="YMD">{tSettings("ymdLabel")}</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-[var(--muted)]">{tSettings("timezoneCurrencyNote")}</p>
        {state.error && (
          <p role="alert" className="text-sm text-red-300">
            {translateValidation(t, state.error)}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm text-[var(--accent)]">
            {translateValidation(t, state.message)}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-4 text-sm font-medium hover:border-[var(--accent)] disabled:opacity-50"
        >
          {pending ? tCommon("saving") : tSettings("savePreferences")}
        </button>
      </form>
    </section>
  );
}
