export default function ProtectedLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading" role="status">
      <div className="h-4 w-28 bg-[var(--raised)]" />
      <div className="h-9 w-64 max-w-full bg-[var(--raised)]" />
      <div className="grid gap-4 md:grid-cols-3">
        {["a", "b", "c"].map((key) => (
          <div key={key} className="h-28 border border-[var(--edge)] bg-[var(--surface)]" />
        ))}
      </div>
      <div className="h-72 border border-[var(--edge)] bg-[var(--surface)]" />
      <span className="sr-only">Loading operational data</span>
    </div>
  );
}
