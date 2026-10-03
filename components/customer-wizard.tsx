"use client";
import { useState, useTransition } from "react";
import {
  saveCustomerAction,
  uploadCustomerDocumentAction,
} from "@/app/[locale]/(protected)/customers/actions";
import { CalendarInput } from "./calendar-input";
import { DocumentPicker } from "./document-picker";
import { useToast } from "./toast";

const fields = [
  ["name", "Customer name", true],
  ["mobile", "Mobile number", true],
  ["email", "Email", false],
  ["address", "Address", true],
  ["remarks", "Remarks", false],
  ["civilIdNumber", "Civil ID number", false],
  ["civilIdExpiry", "Civil ID expiry", false, "date"],
  ["passportNumber", "Passport number", false],
  ["passportExpiry", "Passport expiry", false, "date"],
  ["visaNumber", "Visa number", false],
  ["visaExpiry", "Visa expiry", false, "date"],
  ["drivingLicenceNumber", "Driving licence number", true],
  ["drivingLicenceExpiry", "Driving licence expiry", true, "date"],
  ["sponsorDetails", "Sponsor name/details", false],
] as const;
const documents = [
  ["LICENCE_FRONT", "Licence front", true],
  ["LICENCE_BACK", "Licence back", true],
  ["SIGNATURE", "Customer signature", true],
] as const;
export function CustomerWizard({
  customerId,
  initialData,
  existingDocuments = [],
  onSuccess,
}: {
  customerId?: string;
  initialData?: Record<string, string>;
  existingDocuments?: {
    id: string;
    type: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
  }[];
  onSuccess?: (message: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Record<string, string>>(initialData ?? {});
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [savedCustomerId, setSavedCustomerId] = useState(customerId);
  const [documentFiles, setDocumentFiles] = useState<
    Record<string, { file: File; width: number; height: number }>
  >({});
  const { show } = useToast();
  const set = (key: string, value: string) => setData((old) => ({ ...old, [key]: value }));
  const saveDetails = () =>
    start(async () => {
      const result = await saveCustomerAction(data, customerId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSavedCustomerId(result.id);
      setError("");
      setStep(2);
      show(result.message);
    });
  const submitDocuments = () =>
    start(async () => {
      if (!savedCustomerId) return setError("Save customer details before uploading documents.");
      const missing = documents.filter(
        ([type, , required]) =>
          required &&
          !documentFiles[type] &&
          !existingDocuments.some((document) => document.type === type),
      );
      if (missing.length)
        return setError("Licence front, licence back, and signature are required.");
      for (const [type, item] of Object.entries(documentFiles)) {
        const result = await uploadCustomerDocumentAction(
          savedCustomerId,
          type as "LICENCE_FRONT" | "LICENCE_BACK" | "SIGNATURE",
          item.file,
          item.width,
          item.height,
        );
        if (!result.ok) return setError(result.message);
      }
      if (onSuccess) onSuccess("Customer saved with documents.");
      else window.location.assign("/en/customers");
    });
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-[var(--accent)]">CUSTOMERS / {customerId ? "EDIT" : "CREATE"}</p>
      <h1 className="mt-2 text-3xl font-semibold">
        {customerId ? "Edit customer" : "New customer"}
      </h1>
      <p className="mt-3 text-sm text-[var(--muted)]">
        Minimum rental requirement: a valid driving licence, licence front/back images, signature,
        and one valid identity document (Civil ID, passport, or visa where applicable).
      </p>
      <div className="mt-6 grid grid-cols-2 gap-2 text-sm">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={
            step === 1
              ? "border-b-2 border-[var(--accent)] pb-2"
              : "border-b border-[var(--edge)] pb-2"
          }
        >
          1. Details
        </button>
        <button
          type="button"
          onClick={() => setStep(2)}
          className={
            step === 2
              ? "border-b-2 border-[var(--accent)] pb-2"
              : "border-b border-[var(--edge)] pb-2"
          }
        >
          2. Documents
        </button>
      </div>
      <section className="mt-6 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([key, label, required, type]) => (
              <label key={key} htmlFor={key} className="text-sm">
                {label}
                {type === "date" ? (
                  <CalendarInput
                    id={key}
                    required={required}
                    value={data[key] ?? ""}
                    onChange={(value) => set(key, value)}
                  />
                ) : (
                  <input
                    required={required}
                    type={type ?? (key === "email" ? "email" : "text")}
                    value={data[key] ?? ""}
                    onChange={(e) => set(key, e.target.value)}
                    className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
                  />
                )}
              </label>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {documents.map(([key, label, required]) => (
              <DocumentPicker
                key={key}
                label={label}
                required={required}
                existing={existingDocuments.find((document) => document.type === key)}
                onChange={(file, width, height) =>
                  setDocumentFiles((old) => {
                    const next = { ...old };
                    if (file) next[key] = { file, width, height };
                    else delete next[key];
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
        <div className="mt-7 flex justify-between">
          <button
            type="button"
            onClick={() => setStep(1)}
            disabled={step === 1}
            className="min-h-11 px-4"
          >
            Back
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={saveDetails}
              className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-black"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={submitDocuments}
              className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-black"
            >
              {pending
                ? customerId
                  ? "Updating…"
                  : "Saving…"
                : customerId
                  ? "Update customer"
                  : "Create customer"}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-4 text-red-300">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
