"use client";
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="text-[var(--accent)]">SOMETHING WENT WRONG</p>
        <h1 className="mt-3 text-3xl font-semibold">We could not complete that request.</h1>
        <button
          type="button"
          onClick={reset}
          className="mt-6 min-h-11 rounded-lg bg-[var(--accent)] px-4 text-black"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
