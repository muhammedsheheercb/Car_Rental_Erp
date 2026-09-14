"use client";
import { useActionState } from "react";
import { changePasswordAction } from "./actions";
export default function ChangePasswordPage() {
  const [state, action, pending] = useActionState(changePasswordAction, { error: "" });
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <form
        action={action}
        className="w-full max-w-sm rounded-3xl border border-[var(--edge)] bg-[var(--surface)] p-7"
      >
        <p className="text-xs font-semibold tracking-[.2em] text-[var(--accent)]">
          SECURITY REQUIRED
        </p>
        <h1 className="mt-4 text-3xl font-semibold">Set your password</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Your administrator gave you an initial password. Change it before continuing.
        </p>
        <label className="mt-6 block text-sm">
          Current password
          <input
            required
            name="currentPassword"
            type="password"
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
          />
        </label>
        <label className="mt-4 block text-sm">
          New password
          <input
            required
            name="newPassword"
            minLength={12}
            type="password"
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] px-3"
          />
        </label>
        {state.error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-6 min-h-11 w-full rounded-lg bg-[var(--accent)] font-semibold text-black"
        >
          {pending ? "Saving…" : "Secure account"}
        </button>
      </form>
    </main>
  );
}
