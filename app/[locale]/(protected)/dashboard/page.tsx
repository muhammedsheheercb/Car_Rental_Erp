import { requireIdentity } from "@/lib/auth";
export default async function Dashboard() {
  const user = await requireIdentity();
  return (
    <>
      <p className="text-sm text-[var(--accent)]">OPERATIONS / OMAN</p>
      <h1 className="mt-2 text-3xl font-semibold">Good to see you, {user.displayName}.</h1>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <section className="border-s-2 border-[var(--accent)] bg-[var(--surface)] p-5">
          <p className="text-sm text-[var(--muted)]">Assigned branches</p>
          <p className="mt-3 text-3xl">
            {user.role === "SUPER_ADMIN" ? "All" : user.branchIds.length}
          </p>
        </section>
        <section className="bg-[var(--raised)] p-5 md:col-span-2">
          <p className="text-sm text-[var(--muted)]">Foundation status</p>
          <p className="mt-3">
            Access controls are active. Fleet operations arrive in the next module.
          </p>
        </section>
      </div>
    </>
  );
}
