"use client";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { rentalLifecycleAction } from "@/app/[locale]/(protected)/rentals/lifecycle-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { RentalPeriod } from "@/features/rentals/booking-calculations";
import {
  calculateExpectedReturn,
  formatOmanDateTime,
} from "@/features/rentals/booking-calculations";
import { translateStatus, translateValidation } from "@/lib/i18n-helpers";
import { compressImageFile } from "@/lib/image-compress";

const cls = "min-h-11 min-w-0 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3";
function ActionForm({
  id,
  anchorId,
  operation,
  title,
  children,
  blocked = false,
  confirmDescription,
}: {
  id: string;
  anchorId?: string;
  operation: string;
  title: string;
  children: React.ReactNode;
  blocked?: boolean;
  confirmDescription?: string;
}) {
  const t = useTranslations();
  const tCommon = useTranslations("common");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(rentalLifecycleAction, {
    error: "",
    message: "",
  });
  return (
    <form
      ref={formRef}
      id={anchorId}
      action={action}
      className="grid min-w-0 gap-3 rounded-xl border border-[var(--edge)] p-4"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <input type="hidden" name="rentalId" value={id} />
      <input type="hidden" name="operation" value={operation} />
      {children}
      {confirmDescription ? (
        <ConfirmDialog
          title={title}
          description={confirmDescription}
          confirmLabel={title}
          pending={pending}
          processingLabel={tCommon("saving")}
          onConfirm={() => {
            formRef.current?.requestSubmit();
          }}
          trigger={
            <button
              disabled={pending || blocked}
              onClick={(event) => {
                if (formRef.current && !formRef.current.reportValidity()) {
                  event.preventDefault();
                }
              }}
              className="min-h-11 rounded bg-[var(--accent)] px-4 text-black disabled:opacity-50"
              type="button"
            >
              {pending ? tCommon("saving") : title}
            </button>
          }
        />
      ) : (
        <button
          disabled={pending || blocked}
          className="min-h-11 rounded bg-[var(--accent)] px-4 text-black disabled:opacity-50"
          type="submit"
        >
          {pending ? tCommon("saving") : title}
        </button>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {translateValidation(t, state.error)}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-[var(--accent)]">
          {translateValidation(t, state.message)}
        </p>
      )}
    </form>
  );
}
export function RentalLifecycleForms({
  id,
  status,
  expectedReturnAt,
  period,
  rate,
  startingKm,
  canUpdate,
  canApprove,
  canCancel,
  initialNow,
  cancellationDetails = {},
}: {
  id: string;
  status: string;
  expectedReturnAt: string;
  period: RentalPeriod;
  rate: number;
  startingKm: number;
  canUpdate: boolean;
  canApprove: boolean;
  canCancel: boolean;
  initialNow: string;
  cancellationDetails?: Record<string, string>;
}) {
  const t = useTranslations();
  const tRentals = useTranslations("rentals");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [duration, setDuration] = useState("1");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoCompressing, setPhotoCompressing] = useState(false);
  const [photoError, setPhotoError] = useState("");
  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const handleDamagePhoto = async (raw?: File) => {
    setPhotoError("");
    if (!raw) {
      setPhoto(null);
      return;
    }
    setPhotoCompressing(true);
    try {
      const optimized = await compressImageFile(raw, {
        maxDimension: 1800,
        quality: 0.82,
        maxInputBytes: 10 * 1024 * 1024,
        maxOutputBytes: 5 * 1024 * 1024,
        preserveTransparency: raw.type === "image/png",
      });
      setPhoto(optimized.file);
    } catch (cause) {
      setPhoto(null);
      const rawErr = cause instanceof Error ? cause.message : "Use a photo up to 5 MB.";
      setPhotoError(translateValidation(t, rawErr));
    } finally {
      setPhotoCompressing(false);
    }
  };
  let deadline = "";
  try {
    deadline = formatOmanDateTime(
      calculateExpectedReturn(new Date(expectedReturnAt), period, Number(duration)),
    );
  } catch {
    /* Incomplete duration */
  }
  if (!canUpdate) return null;
  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-2">
      {status === "RESERVED" && (
        <ActionForm id={id} operation="checkout" title={tRentals("checkoutVehicle")}>
          <label>
            {tRentals("startingKm")}
            <input
              name="startingKm"
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              defaultValue={startingKm}
              className={cls}
            />
          </label>
        </ActionForm>
      )}
      {status === "ACTIVE" && canApprove && (
        <ActionForm
          id={id}
          anchorId="extend"
          operation="extend"
          title={tRentals("approveExtension")}
        >
          <p className="text-sm text-[var(--muted)]">
            {formatOmanDateTime(new Date(expectedReturnAt)).replace("T", " ")} (
            {tCommon("omanTime")})
          </p>
          <label>
            {tRentals("extensionDuration", { period: translateStatus(tStatus, period) })}
            <input
              name="duration"
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              className={cls}
            />
          </label>
          <label>
            {tRentals("newExpectedReturn")}
            <input type="datetime-local" readOnly value={deadline} className={cls} />
          </label>
          <p>
            {tRentals("additionalRent")}:{" "}
            {Number.isFinite(Number(duration))
              ? ((Number(duration) * rate) / 1000).toFixed(3)
              : "—"}{" "}
            {tCommon("omr")}
          </p>
          <label>
            {tCommon("remarks")}
            <textarea name="remarks" required maxLength={1000} className={cls} />
          </label>
        </ActionForm>
      )}
      {status === "ACTIVE" && (
        <ActionForm id={id} operation="return" title={tRentals("returnVehicle")}>
          <label>
            {tRentals("actualReturnDateTime")}
            <input
              name="returnedAt"
              required
              type="datetime-local"
              defaultValue={formatOmanDateTime(new Date(initialNow))}
              className={cls}
            />
          </label>
          <label>
            {tRentals("endingKm")}
            <input
              name="endingKm"
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              className={cls}
            />
          </label>
        </ActionForm>
      )}
      {["RESERVED", "ACTIVE"].includes(status) && (
        <ActionForm
          id={id}
          anchorId="cancel"
          operation="cancel"
          title={tRentals("cancelAgreement")}
          blocked={!canCancel}
          confirmDescription={tRentals("cancelConfirmDesc")}
        >
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {Object.entries(cancellationDetails).map(([label, value]) => (
              <label key={label} className="min-w-0 text-sm">
                {label}
                <input readOnly value={value} className={cls} />
              </label>
            ))}
          </div>
          <p className="text-sm text-[var(--muted)]">
            {canCancel ? tRentals("cancelAllowedNote") : tRentals("cancelExpiredNote")}
          </p>
          <label>
            {tRentals("startingKm")}
            <input readOnly name="startingKm" value={startingKm} className={cls} />
          </label>
          <label>
            {tRentals("endingKm")}
            <input
              name="endingKm"
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              defaultValue={startingKm}
              className={cls}
            />
          </label>
          <label>
            {tCommon("remarks")}
            <textarea name="remarks" required maxLength={1000} className={cls} />
          </label>
          <label className="flex items-center gap-2">
            <input name="confirmed" type="checkbox" required />
            {tRentals("confirmCancelCheckbox")}
          </label>
        </ActionForm>
      )}
      {["RESERVED", "ACTIVE", "RETURNED"].includes(status) && (
        <ActionForm
          id={id}
          anchorId="damage"
          operation="damage"
          title={tRentals("saveDamageEvidence")}
          blocked={photoCompressing || !photo || !!photoError}
        >
          <input
            name="phase"
            type="hidden"
            value={
              status === "RESERVED"
                ? "BEFORE_RENTAL"
                : status === "ACTIVE"
                  ? "DURING_RENTAL"
                  : "AFTER_RETURN"
            }
          />
          <p className="font-medium">
            {status === "RESERVED"
              ? tRentals("beforeRentalEvidence")
              : status === "ACTIVE"
                ? tRentals("duringRentalEvidence")
                : tRentals("afterReturnEvidence")}
          </p>
          <label>
            {tRentals("damageLocation")}
            <input required name="location" maxLength={120} className={cls} />
          </label>
          <label>
            {tCommon("description")}
            <textarea required name="description" maxLength={1000} className={cls} />
          </label>
          <label>
            {tCommon("remarks")}
            <textarea name="remarks" maxLength={1000} className={cls} />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="min-h-11 cursor-pointer rounded border border-[var(--edge)] px-3 py-3 text-sm">
              {tCommon("takePhoto")}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(event) => {
                  void handleDamagePhoto(event.target.files?.[0]);
                }}
              />
            </label>
            <label className="min-h-11 cursor-pointer rounded border border-[var(--edge)] px-3 py-3 text-sm">
              {tRentals("uploadPhoto")}
              <input
                type="file"
                className="sr-only"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  void handleDamagePhoto(event.target.files?.[0]);
                }}
              />
            </label>
          </div>
          <input
            name="photo"
            required
            type="file"
            className="sr-only"
            ref={(element) => {
              if (element && photo) {
                const transfer = new DataTransfer();
                transfer.items.add(photo);
                element.files = transfer.files;
              }
            }}
          />
          {photoCompressing && (
            <p className="text-xs text-[var(--muted)]" role="status">
              {tCommon("compressingImage")}
            </p>
          )}
          {photo && (
            <div className="flex items-center gap-3">
              {photoPreview && (
                /* biome-ignore lint/performance/noImgElement: local object URL preview for selected damage photo */
                <img
                  src={photoPreview}
                  alt={tRentals("saveDamageEvidence")}
                  className="h-16 w-24 rounded-lg border border-[var(--edge)] object-cover"
                />
              )}
              <div className="min-w-0 text-sm">
                <p className="break-all">{photo.name}</p>
                <p className="text-xs text-[var(--muted)]">{(photo.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          )}
          {photoError && (
            <p role="alert" className="text-sm text-red-300">
              {photoError}
            </p>
          )}
        </ActionForm>
      )}
    </div>
  );
}
