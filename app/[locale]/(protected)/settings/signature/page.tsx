import { and, count, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SignatureForm } from "@/components/settings-forms";
import { db } from "@/db/client";
import { userSignatures } from "@/db/schema";
import { canManageOtherSignatures, signatureUsers } from "@/features/signatures/service";
import { can, requirePermission } from "@/lib/auth";

export default async function SignatureSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const actor = await requirePermission("settings", "read");
  const [{ locale }, tSettings] = await Promise.all([params, getTranslations("settings")]);
  const options = await signatureUsers(actor);
  const optionIds = options.map((u) => u.id);

  const [existing, versionCounts] = optionIds.length
    ? await Promise.all([
        db
          .select({ id: userSignatures.id, userId: userSignatures.userId })
          .from(userSignatures)
          .where(
            and(inArray(userSignatures.userId, optionIds), eq(userSignatures.isCurrent, true)),
          ),
        db
          .select({ userId: userSignatures.userId, total: count() })
          .from(userSignatures)
          .where(inArray(userSignatures.userId, optionIds))
          .groupBy(userSignatures.userId),
      ])
    : [[], []];

  const canEdit = can(actor, "settings", "update");
  const canManageOthers = canManageOtherSignatures(actor);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--accent)]">{tSettings("signaturesEyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold">{tSettings("signaturesTitle")}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {canManageOthers
              ? tSettings("signaturesSubtitleAdmin")
              : tSettings("signaturesSubtitleSelf")}
          </p>
        </div>
        <Link
          href={`/${locale}/settings` as never}
          className="min-h-11 content-center rounded-lg border border-[var(--edge)] px-4 text-center text-sm"
        >
          {tSettings("backToSettings")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
        {canEdit ? (
          <SignatureForm
            users={options}
            initialUser={options.find((u) => u.id === actor.id)?.id ?? options[0]?.id ?? ""}
            existing={existing}
          />
        ) : (
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
            <h2 className="text-lg font-semibold">{tSettings("signatureUnavailableTitle")}</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {tSettings("signatureUnavailableBody")}
            </p>
          </section>
        )}

        <aside className="space-y-4">
          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5 text-sm">
            <h2 className="text-base font-semibold">{tSettings("howSignaturesUsed")}</h2>
            <ul className="mt-3 list-disc space-y-2 ps-5 text-[var(--muted)]">
              <li>{tSettings("signatureBullet1")}</li>
              <li>{tSettings("signatureBullet2")}</li>
              <li>{tSettings("signatureBullet3")}</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5 text-sm">
            <h2 className="text-base font-semibold">{tSettings("configuredAccounts")}</h2>
            <div className="mt-3 divide-y divide-[var(--edge)]">
              {options.map((u) => {
                const hasCurrent = existing.some((item) => item.userId === u.id);
                const versions = versionCounts.find((v) => v.userId === u.id)?.total ?? 0;
                return (
                  <div key={u.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="truncate font-medium">{u.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${hasCurrent ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-[var(--muted)]"}`}
                    >
                      {hasCurrent
                        ? tSettings("savedVersions", { count: versions })
                        : tSettings("notSet")}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
