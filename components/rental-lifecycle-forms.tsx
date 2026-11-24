"use client";
import { useActionState, useEffect, useState } from "react";
import { rentalLifecycleAction } from "@/app/[locale]/(protected)/rentals/lifecycle-actions";
import type { RentalPeriod } from "@/features/rentals/booking-calculations";
import {
  calculateExpectedReturn,
  formatOmanDateTime,
} from "@/features/rentals/booking-calculations";
import { compressImageFile } from "@/lib/image-compress";

const cls = "min-h-11 min-w-0 w-full rounded border border-[var(--edge)] bg-[var(--raised)] px-3";
function ActionForm({
  id,
  anchorId,
  operation,
  title,
  children,
  blocked = false,
}: {
  id: string;
  anchorId?: string;
  operation: string;
  title: string;
  children: React.ReactNode;
  blocked?: boolean;
}) {
  const [state, action, pending] = useActionState(rentalLifecycleAction, {
    error: "",
    message: "",
  });
  return (
    <form
      id={anchorId}
      action={action}
      className="grid min-w-0 gap-3 rounded-xl border border-[var(--edge)] p-4"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <input type="hidden" name="rentalId" value={id} />
      <input type="hidden" name="operation" value={operation} />
      {children}
      <button
        disabled={pending || blocked}
        className="min-h-11 rounded bg-[var(--accent)] px-4 text-black"
        type="submit"
      >
        {pending ? "Saving…" : title}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-[var(--accent)]">
          {state.message}
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
      setPhotoError(cause instanceof Error ? cause.message : "Use a photo up to 5 MB.");
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
        <ActionForm id={id} operation="checkout" title="Check out vehicle">
          <label>
            Starting KM
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
        <ActionForm id={id} anchorId="extend" operation="extend" title="Approve contract extension">
          <p className="text-sm text-[var(--muted)]">
            Previous expected return:{" "}
            {formatOmanDateTime(new Date(expectedReturnAt)).replace("T", " ")} (Oman)
          </p>
          <label>
            Extension duration ({period.toLowerCase()} periods)
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
            New expected return (Oman)
            <input type="datetime-local" readOnly value={deadline} className={cls} />
          </label>
          <p>
            Additional rent:{" "}
            {Number.isFinite(Number(duration))
              ? ((Number(duration) * rate) / 1000).toFixed(3)
              : "—"}{" "}
            OMR
          </p>
          <label>
            Remarks
            <textarea name="remarks" required maxLength={1000} className={cls} />
          </label>
        </ActionForm>
      )}
      {status === "ACTIVE" && (
        <ActionForm id={id} operation="return" title="Return vehicle">
          <label>
            Actual return date/time (Oman)
            <input
              name="returnedAt"
              required
              type="datetime-local"
              defaultValue={formatOmanDateTime(new Date(initialNow))}
              className={cls}
            />
          </label>
          <label>
            Ending KM
            <input
              name="endingKm"
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              className={cls}
            />
          </label>
          <p className="text-sm text-[var(--muted)]">
            The server calculates and records additional rent, late fees, overdue fines and excess
            KM separately using the approved deadline.
          </p>
        </ActionForm>
      )}
      {["RESERVED", "ACTIVE"].includes(status) && (
        <ActionForm
          id={id}
          anchorId="cancel"
          operation="cancel"
          title="Cancel agreement"
          blocked={!canCancel}
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
            {canCancel
              ? "Cancellation is currently allowed. Financial history is retained."
              : "The 15-minute window has expired. An authorized admin must cancel."}
          </p>
          <label>
            Starting KM
            <input readOnly name="startingKm" value={startingKm} className={cls} />
          </label>
          <label>
            Ending KM
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
            Remarks
            <textarea name="remarks" required maxLength={1000} className={cls} />
          </label>
          <label className="flex items-center gap-2">
            <input name="confirmed" type="checkbox" required />
            Cancel Agreement
          </label>
        </ActionForm>
      )}
      {["RESERVED", "RETURNED"].includes(status) && (
        <ActionForm
          id={id}
          anchorId="damage"
          operation="damage"
          title="Save scratch / damage evidence"
          blocked={photoCompressing || !photo || !!photoError}
        >
          <input
            name="phase"
            type="hidden"
            value={status === "RESERVED" ? "BEFORE_RENTAL" : "AFTER_RETURN"}
          />
          <p className="font-medium">
            {status === "RESERVED" ? "Before rental" : "After return"} evidence
          </p>
          <label>
            Damage location
            <input required name="location" maxLength={120} className={cls} />
          </label>
          <label>
            Description
            <textarea required name="description" maxLength={1000} className={cls} />
          </label>
          <label>
            Remarks
            <textarea name="remarks" maxLength={1000} className={cls} />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="min-h-11 cursor-pointer rounded border border-[var(--edge)] px-3 py-3 text-sm">
              Take Photo
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
              Upload Photo
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
              Compressing photo…
            </p>
          )}
          {photo && (
            <div className="flex items-center gap-3">
              {photoPreview && (
                /* biome-ignore lint/performance/noImgElement: local object URL preview for selected damage photo */
                <img
                  src={photoPreview}
                  alt="Selected scratch evidence preview"
                  className="h-16 w-24 rounded-lg border border-[var(--edge)] object-cover"
                />
              )}
              <div className="min-w-0 text-sm">
                <p className="break-all">Selected: {photo.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {(photo.size / 1024).toFixed(1)} KB (compressed)
                </p>
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
