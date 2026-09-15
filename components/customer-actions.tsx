"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  deleteCustomerAction,
  getCustomerDetailsAction,
  setCustomerActiveAction,
} from "@/app/[locale]/(protected)/customers/actions";
import { BlacklistDialog } from "./blacklist-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { CustomerWizard } from "./customer-wizard";
import { useToast } from "./toast";
import { UnblacklistButton } from "./unblacklist-button";

type Details = Awaited<ReturnType<typeof getCustomerDetailsAction>>;
export function CustomerActions({
  id,
  name,
  number,
  active,
  blacklistId,
  mobile,
  blacklistReason,
}: {
  id: string;
  name: string;
  number: string;
  active: boolean;
  blacklistId: string | null;
  mobile: string;
  blacklistReason: string | null;
}) {
  const [details, setDetails] = useState<Details | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isActive, setIsActive] = useState(active);
  const [activeBlacklistId, setActiveBlacklistId] = useState(blacklistId);
  useEffect(() => {
    setActiveBlacklistId(blacklistId);
  }, [blacklistId]);
  const { show } = useToast();
  const router = useRouter();
  const view = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      setDetails(await getCustomerDetailsAction(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customer details.");
    } finally {
      setLoading(false);
    }
  };
  const edit = async () => {
    setEditing(true);
    setLoading(true);
    setError("");
    try {
      setDetails(await getCustomerDetailsAction(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customer details.");
    } finally {
      setLoading(false);
    }
  };
  const status = async () => {
    setLoading(true);
    try {
      const result = await setCustomerActiveAction(id, !isActive);
      if (!result.ok) {
        show(result.message, "error");
        return;
      }
      setIsActive(!isActive);
      show(result.message);
      router.refresh();
    } finally {
      setLoading(false);
    }
  };
  const remove = async () => {
    setLoading(true);
    try {
      const result = await deleteCustomerAction(id);
      show(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <div className="flex min-w-max flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
        <button
          type="button"
          aria-label={`View ${name}`}
          title="View customer details"
          onClick={view}
          className="min-h-10 min-w-10 rounded-lg text-white"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="mx-auto h-5 w-5 fill-none stroke-current"
          >
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2.5" strokeWidth="1.8" />
          </svg>
        </button>
        <button type="button" onClick={edit} className="min-h-10 px-2 text-sm text-[var(--accent)]">
          Edit
        </button>
        <ConfirmDialog
          trigger={
            <button
              type="button"
              disabled={loading}
              className="min-h-10 rounded-lg border border-[var(--edge)] px-2 text-sm"
            >
              {loading
                ? isActive
                  ? "Deactivating…"
                  : "Activating…"
                : isActive
                  ? "Deactivate"
                  : "Activate"}
            </button>
          }
          title={`${isActive ? "Deactivate" : "Activate"} ${name}?`}
          description={`Customer ID: ${number}`}
          confirmLabel={isActive ? "Deactivate" : "Activate"}
          processingLabel={isActive ? "Deactivating…" : "Activating…"}
          onConfirm={status}
        />
        <ConfirmDialog
          trigger={
            <button type="button" disabled={loading} className="min-h-10 px-2 text-sm text-red-300">
              Delete
            </button>
          }
          title={`Delete ${name}?`}
          description={`Customer ID: ${number}. This is permanent and only allowed with no history.`}
          confirmLabel="Delete"
          processingLabel="Deleting…"
          onConfirm={remove}
        />
        {activeBlacklistId ? (
          <UnblacklistButton
            id={activeBlacklistId}
            name={name}
            customerNumber={number}
            reason={blacklistReason}
            onSuccess={() => setActiveBlacklistId(null)}
          />
        ) : (
          <BlacklistDialog
            customerId={id}
            customerName={name}
            customerNumber={number}
            mobile={mobile}
            trigger="Add to Blacklist"
            onSuccess={setActiveBlacklistId}
          />
        )}
      </div>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--raised)] p-5 sm:max-w-2xl sm:rounded-2xl"
          >
            <div className="flex justify-between">
              <h2 className="text-xl font-semibold">{name}</h2>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3">
                ×
              </button>
            </div>
            {loading && (
              <p className="mt-6 text-[var(--muted)]">Loading latest customer details…</p>
            )}
            {error && (
              <div className="mt-6">
                <p className="text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={view}
                  className="mt-3 min-h-11 border border-[var(--edge)] px-3"
                >
                  Retry
                </button>
              </div>
            )}
            {details && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ["Customer ID", details.customerNumber],
                  ["Mobile", details.mobile],
                  ["Email", details.email ?? "—"],
                  ["Address", details.address],
                  ["Civil ID", details.civilIdNumber ?? "—"],
                  ["Passport", details.passportNumber ?? "—"],
                  ["Visa", details.visaNumber ?? "—"],
                  ["Driving licence", details.drivingLicenceNumber],
                  ["Sponsor / family details", details.sponsorDetails ?? "—"],
                  ["Account", details.isActive ? "Active" : "Inactive"],
                  ["Balance", `${details.balance}`],
                  ["Active rentals", String(details.activeRentals.length)],
                  ["Blacklist", details.blacklist.some((x) => x.isActive) ? "Active" : "None"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="border-b border-[var(--edge)] pb-2">
                    <p className="text-xs text-[var(--muted)]">{label}</p>
                    <p className="break-words">{value}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={() => !loading && setEditing(false)}
          className="fixed inset-0 z-50 grid place-items-end bg-black/70 sm:place-items-center sm:p-4"
        >
          <section
            role="document"
            onMouseDown={(e) => e.stopPropagation()}
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-[var(--raised)] p-5 sm:max-w-4xl sm:rounded-2xl"
          >
            <button
              type="button"
              aria-label="Close edit"
              onClick={() => setEditing(false)}
              className="float-end min-h-11 px-3"
            >
              ×
            </button>
            {loading && <p className="mt-6 text-[var(--muted)]">Loading customer…</p>}
            {error && (
              <div className="mt-6">
                <p className="text-red-300">{error}</p>
                <button
                  type="button"
                  onClick={edit}
                  className="mt-3 min-h-11 border border-[var(--edge)] px-3"
                >
                  Retry
                </button>
              </div>
            )}
            {details && (
              <CustomerWizard
                customerId={id}
                existingDocuments={details.documents}
                initialData={{
                  name: details.name,
                  mobile: details.mobile,
                  email: details.email ?? "",
                  address: details.address,
                  remarks: details.remarks ?? "",
                  civilIdNumber: details.civilIdNumber ?? "",
                  civilIdExpiry: details.civilIdExpiry ?? "",
                  passportNumber: details.passportNumber ?? "",
                  passportExpiry: details.passportExpiry ?? "",
                  visaNumber: details.visaNumber ?? "",
                  visaExpiry: details.visaExpiry ?? "",
                  drivingLicenceNumber: details.drivingLicenceNumber,
                  drivingLicenceExpiry: details.drivingLicenceExpiry,
                  sponsorDetails: details.sponsorDetails ?? "",
                }}
                onSuccess={(message) => {
                  setEditing(false);
                  show(message, "success", `customer-${id}`);
                  router.refresh();
                  if (open) view();
                }}
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}
