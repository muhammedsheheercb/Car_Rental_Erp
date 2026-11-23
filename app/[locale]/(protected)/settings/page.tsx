import { and, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import Link from "next/link";
import { ChangePasswordForm, PreferencesForm } from "@/components/settings-account-forms";
import { AlertSettingsForm } from "@/components/settings-forms";
import { db } from "@/db/client";
import { branches, userSignatures } from "@/db/schema";
import { fleetAlertSettings } from "@/features/maintenance/settings";
import { can, requirePermission } from "@/lib/auth";
import { userPreferencesSchema } from "@/lib/validation";

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const actor = await requirePermission("settings", "read");
  const { locale } = await params;

  const [policy, assignedBranches, ownSignatureRows, cookieStore] = await Promise.all([
    fleetAlertSettings(),
    db
      .select({
        id: branches.id,
        name: branches.name,
        code: branches.code,
        location: branches.location,
      })
      .from(branches)
      .where(
        and(
          eq(branches.isActive, true),
          actor.role === "SUPER_ADMIN"
            ? undefined
            : actor.branchIds.length
              ? inArray(branches.id, actor.branchIds)
              : sql`false`,
        ),
      ),
    db
      .select({ id: userSignatures.id, createdAt: userSignatures.createdAt })
      .from(userSignatures)
      .where(and(eq(userSignatures.userId, actor.id), eq(userSignatures.isCurrent, true)))
      .limit(1),
    cookies(),
  ]);

  let preferences: { tableDensity: "comfortable" | "compact"; dateFormat: "DMY" | "YMD" } = {
    tableDensity: "comfortable",
    dateFormat: "DMY",
  };
  const rawPrefs = cookieStore.get("muscat_cars_prefs")?.value;
  if (rawPrefs) {
    try {
      const parsed = userPreferencesSchema.safeParse(JSON.parse(rawPrefs));
      if (parsed.success) preferences = parsed.data;
    } catch {
      /* ignore malformed preference cookie */
    }
  }

  const ownSignature = ownSignatureRows[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--accent)]">ACCOUNT & SYSTEM</p>
          <h1 className="mt-2 text-3xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Manage your profile, password, language preferences, signatures, and branch alert
            thresholds.
          </p>
        </div>
        <Link
          href={`/${locale}/settings/signature` as never}
          className="min-h-11 content-center rounded-lg bg-[var(--accent)] px-4 text-center text-sm font-semibold text-black"
        >
          User Signature Settings
        </Link>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="grid gap-5 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
          <div>
            <h2 className="text-lg font-semibold">Profile & Branch Access</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Signed-in account details and permitted operating branches.
            </p>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="border-b border-[var(--edge)] pb-3">
              <dt className="text-xs text-[var(--muted)]">Display name</dt>
              <dd className="mt-1 font-medium">{actor.displayName}</dd>
            </div>
            <div className="border-b border-[var(--edge)] pb-3">
              <dt className="text-xs text-[var(--muted)]">Username</dt>
              <dd className="mt-1 font-mono">{actor.username}</dd>
            </div>
            <div className="border-b border-[var(--edge)] pb-3">
              <dt className="text-xs text-[var(--muted)]">Role</dt>
              <dd className="mt-1">
                <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
                  {actor.role}
                </span>
              </dd>
            </div>
            <div className="border-b border-[var(--edge)] pb-3">
              <dt className="text-xs text-[var(--muted)]">Branch scope</dt>
              <dd className="mt-1">
                {actor.role === "SUPER_ADMIN"
                  ? `All active branches (${assignedBranches.length})`
                  : `${assignedBranches.length} assigned branch${assignedBranches.length === 1 ? "" : "es"}`}
              </dd>
            </div>
          </dl>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Permitted branches
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {assignedBranches.map((branch) => (
                <span
                  key={branch.id}
                  className="rounded-lg border border-[var(--edge)] bg-black/20 px-3 py-1.5 text-xs"
                >
                  <span className="font-medium text-white">{branch.name}</span> ·{" "}
                  <span className="font-mono text-[var(--muted)]">{branch.code}</span>
                </span>
              ))}
              {!assignedBranches.length && (
                <span className="text-xs text-[var(--muted)]">No branches assigned.</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--edge)] bg-black/20 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Digital signature</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {ownSignature
                  ? "Configured and automatically applied to your printed documents."
                  : "Not configured yet. Add your signature for printed bills and agreements."}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {ownSignature && (
                <div className="rounded-lg bg-white p-1.5">
                  {/* biome-ignore lint/performance/noImgElement: authenticated private signature preview */}
                  <img
                    src={`/api/user-signatures/${ownSignature.id}`}
                    alt="Current user signature"
                    className="h-10 w-24 object-contain"
                  />
                </div>
              )}
              <Link
                href={`/${locale}/settings/signature` as never}
                className="min-h-10 content-center rounded-lg border border-[var(--edge)] px-3 text-sm font-medium text-[var(--accent)]"
              >
                {ownSignature ? "Manage" : "Set up"}
              </Link>
            </div>
          </div>
        </div>

        <ChangePasswordForm />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <PreferencesForm locale={locale} initialPreferences={preferences} />

        {["ADMIN", "SUPER_ADMIN"].includes(actor.role) && can(actor, "settings", "update") ? (
          <AlertSettingsForm
            nearServiceKm={policy.nearServiceKm}
            expirySoonDays={policy.expirySoonDays}
          />
        ) : (
          <div className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">Branch & Fleet Alert Thresholds</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Configured by administrators for all operating branches.
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--edge)] bg-black/20 p-3">
                <dt className="text-xs text-[var(--muted)]">Near To Service</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {policy.nearServiceKm.toLocaleString()} KM
                </dd>
              </div>
              <div className="rounded-xl border border-[var(--edge)] bg-black/20 p-3">
                <dt className="text-xs text-[var(--muted)]">Expiring Soon</dt>
                <dd className="mt-1 text-lg font-semibold">{policy.expirySoonDays} days</dd>
              </div>
            </dl>
          </div>
        )}
      </section>
    </div>
  );
}
