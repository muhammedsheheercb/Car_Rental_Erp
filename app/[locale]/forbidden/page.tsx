export default function Forbidden() {
  return (
    <main className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-[var(--accent)]">403</p>
        <h1 className="mt-3 text-3xl font-semibold">Access restricted.</h1>
        <p className="mt-2 text-[var(--muted)]">
          Your account does not have permission for this action.
        </p>
      </div>
    </main>
  );
}
