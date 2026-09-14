"use client";
import { useActionState, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { loginAction } from "./actions";
export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { show } = useToast();
  useEffect(() => {
    if (state.error) show(state.error, "error", "login-error");
  }, [show, state.error]);
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[#080908] p-5">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-60"
        style={{ backgroundImage: "url('/images/login-oman-night.png')" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/45"
      />
      <form
        action={action}
        className="relative w-full max-w-sm rounded-3xl border border-white/15 bg-[#11120f]/95 p-7 shadow-2xl backdrop-blur"
      >
        <p className="text-xs font-semibold tracking-[.2em] text-[var(--accent)]">MUSCAT CARS</p>
        <h1 className="mt-4 text-3xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sign in to your secure operations workspace.
        </p>
        <label className="mt-7 block text-sm">
          Username
          <input
            name="username"
            autoComplete="username"
            required
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
          />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <span className="relative mt-2 block">
            <input
              name="password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              className="min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3 pe-12"
            />
            <button
              type="button"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
              aria-pressed={passwordVisible}
              onClick={() => setPasswordVisible((visible) => !visible)}
              className="absolute inset-y-0 end-0 grid min-h-11 w-11 place-items-center text-[var(--muted)] hover:text-white"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="h-5 w-5 fill-none stroke-current stroke-2"
              >
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
                {passwordVisible && <path d="m4 4 16 16" />}
              </svg>
            </button>
          </span>
        </label>
        {state.error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="mt-7 min-h-11 w-full rounded-lg bg-[var(--accent)] px-4 font-semibold text-black disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
