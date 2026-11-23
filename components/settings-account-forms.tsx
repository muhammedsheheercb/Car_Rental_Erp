"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { settingsAction } from "@/app/[locale]/(protected)/settings/actions";

export function ChangePasswordForm() {
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
          <h2 className="text-lg font-semibold">Change Password</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Use at least 12 characters. Password changes are recorded in the security audit log.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPasswords((v) => !v)}
          className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-xs text-[var(--muted)]"
        >
          {showPasswords ? "Hide passwords" : "Show passwords"}
        </button>
      </div>

      <label className="block text-sm">
        Current password
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
          New password
          <input
            name="newPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            placeholder="Minimum 12 characters"
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
          />
        </label>
        <label className="block text-sm">
          Confirm new password
          <input
            name="confirmPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            placeholder="Repeat new password"
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
          />
        </label>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-[var(--accent)]">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:opacity-50"
      >
        {pending ? "Updating password…" : "Update Password"}
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
  const [state, action, pending] = useActionState(settingsAction, { error: "", message: "" });

  return (
    <section className="grid gap-5 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
      <div>
        <h2 className="text-lg font-semibold">Language & Preferences</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Choose your interface language (with automatic RTL support for Arabic) and display
          preferences.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Interface language</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={"/en/settings" as never}
            aria-current={locale === "en" ? "page" : undefined}
            className={`min-h-11 rounded-xl border p-3 text-sm ${locale === "en" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-[var(--edge)] text-[var(--muted)] hover:text-white"}`}
          >
            <p className="font-semibold">English</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Left-to-right (LTR)</p>
          </Link>
          <Link
            href={"/ar/settings" as never}
            aria-current={locale === "ar" ? "page" : undefined}
            className={`min-h-11 rounded-xl border p-3 text-sm ${locale === "ar" ? "border-[var(--accent)] bg-[var(--accent)]/10 text-white" : "border-[var(--edge)] text-[var(--muted)] hover:text-white"}`}
          >
            <p className="font-semibold">العربية</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">Right-to-left (RTL)</p>
          </Link>
        </div>
      </div>

      <form action={action} className="grid gap-4 border-t border-[var(--edge)] pt-4">
        <input type="hidden" name="operation" value="preferences" />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            Table density
            <select
              name="tableDensity"
              defaultValue={initialPreferences.tableDensity}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="block text-sm">
            Preferred date display
            <select
              name="dateFormat"
              defaultValue={initialPreferences.dateFormat}
              className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
            >
              <option value="DMY">DD/MM/YYYY (Oman standard)</option>
              <option value="YMD">YYYY-MM-DD (ISO)</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-[var(--muted)]">
          Business timezone: <span className="text-[var(--ink)]">Asia/Muscat (UTC+04:00)</span> ·
          Currency: <span className="text-[var(--ink)]">OMR (Omani Rial)</span>
        </p>
        {state.error && (
          <p role="alert" className="text-sm text-red-300">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-sm text-[var(--accent)]">
            {state.message}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-lg border border-[var(--edge)] bg-[var(--raised)] px-4 text-sm font-medium hover:border-[var(--accent)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Preferences"}
        </button>
      </form>
    </section>
  );
}
