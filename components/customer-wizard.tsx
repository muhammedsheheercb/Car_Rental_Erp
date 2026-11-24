"use client";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  saveCustomerAction,
  uploadCustomerDocumentAction,
} from "@/app/[locale]/(protected)/customers/actions";
import { translateValidation } from "@/lib/i18n-helpers";
import { CalendarInput } from "./calendar-input";
import { DocumentPicker } from "./document-picker";
import { useToast } from "./toast";

const fields = [
  ["name", "name", true],
  ["mobile", "mobile", true],
  ["email", "email", false],
  ["address", "address", true],
  ["remarks", "remarks", false],
  ["civilIdNumber", "civilIdNumber", false],
  ["civilIdExpiry", "civilIdExpiry", false, "date"],
  ["passportNumber", "passportNumber", false],
  ["passportExpiry", "passportExpiry", false, "date"],
  ["visaNumber", "visaNumber", false],
  ["visaExpiry", "visaExpiry", false, "date"],
  ["drivingLicenceNumber", "drivingLicenceNumber", true],
  ["drivingLicenceExpiry", "drivingLicenceExpiry", true, "date"],
  ["sponsorDetails", "sponsorDetails", false],
] as const;
const documents = [
  ["LICENCE_FRONT", "licenceFront", true],
  ["LICENCE_BACK", "licenceBack", true],
  ["SIGNATURE", "signature", true],
] as const;
export function CustomerWizard({
  customerId,
  initialData,
  existingDocuments = [],
  locale = "en",
  returnTo,
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
  locale?: string;
  returnTo?: string;
  onSuccess?: (message: string) => void;
}) {
  const t = useTranslations();
  const tWiz = useTranslations("customers.wizard");
  const tCommon = useTranslations("common");
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
        setError(translateValidation(t, result.message));
        return;
      }
      setSavedCustomerId(result.id);
      setError("");
      setStep(2);
      show(result.message);
    });
  const submitDocuments = () =>
    start(async () => {
      if (!savedCustomerId)
        return setError(
          translateValidation(t, "Save customer details before uploading documents."),
        );
      const missing = documents.filter(
        ([type, , required]) =>
          required &&
          !documentFiles[type] &&
          !existingDocuments.some((document) => document.type === type),
      );
      if (missing.length)
        return setError(
          translateValidation(t, "Licence front, licence back, and signature are required."),
        );
      for (const [type, item] of Object.entries(documentFiles)) {
        const result = await uploadCustomerDocumentAction(
          savedCustomerId,
          type as "LICENCE_FRONT" | "LICENCE_BACK" | "SIGNATURE",
          item.file,
          item.width,
          item.height,
        );
        if (!result.ok) return setError(translateValidation(t, result.message));
      }
      if (onSuccess) onSuccess("Customer saved with documents.");
      else if (returnTo) {
        const target = new URL(returnTo, window.location.origin);
        target.searchParams.set("customerId", savedCustomerId);
        window.location.assign(`${target.pathname}${target.search}`);
      } else window.location.assign(`/${locale}/customers`);
    });
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-[var(--accent)]">
        {customerId ? tWiz("eyebrowEdit") : tWiz("eyebrowCreate")}
      </p>
      <h1 className="mt-2 text-3xl font-semibold">
        {customerId ? tWiz("editTitle") : tWiz("newTitle")}
      </h1>
      {returnTo && (
        <p className="mt-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 text-sm text-[var(--accent)]">
          {tWiz("bookingReturnHint")}
        </p>
      )}
      <p className="mt-3 text-sm text-[var(--muted)]">{tWiz("requirementNote")}</p>
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
          {tWiz("step1")}
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
          {tWiz("step2")}
        </button>
      </div>
      <section className="mt-6 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5">
        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map(([key, labelKey, required, type]) => (
              <label key={key} htmlFor={key} className="text-sm">
                {tWiz(labelKey)}
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
            {documents.map(([key, labelKey, required]) => (
              <DocumentPicker
                key={key}
                label={tWiz(labelKey)}
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
            {tCommon("back")}
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={saveDetails}
              className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-black"
            >
              {tCommon("continue")}
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
                  ? tCommon("updating")
                  : tCommon("saving")
                : customerId
                  ? tWiz("updateCustomer")
                  : tWiz("createCustomer")}
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
