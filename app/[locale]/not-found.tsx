import Link from "next/link";
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="text-[var(--accent)]">404</p>
        <h1 className="mt-3 text-3xl font-semibold">That page is not here.</h1>
        <Link
          href="/en/dashboard"
          className="mt-6 inline-block min-h-11 rounded-lg bg-[var(--accent)] px-4 py-3 text-black"
        >
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
