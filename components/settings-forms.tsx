"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { settingsAction } from "@/app/[locale]/(protected)/settings/actions";
export function AlertSettingsForm({
  nearServiceKm,
  expirySoonDays,
}: {
  nearServiceKm: number;
  expirySoonDays: number;
}) {
  const [state, action, pending] = useActionState(settingsAction, { error: "", message: "" });
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-[var(--edge)] p-4">
      <input type="hidden" name="operation" value="alerts" />
      <h2 className="text-xl font-semibold">Fleet Alert Thresholds</h2>
      <label>
        Near To Service — KM remaining
        <input
          name="nearServiceKm"
          inputMode="numeric"
          pattern="[0-9]+"
          defaultValue={nearServiceKm}
          required
          className="input mt-1"
        />
      </label>
      <label>
        Expiring Soon — days remaining
        <input
          name="expirySoonDays"
          inputMode="numeric"
          pattern="[0-9]+"
          defaultValue={expirySoonDays}
          required
          className="input mt-1"
        />
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button type="submit" className="btn" disabled={pending}>
        Save Thresholds
      </button>
    </form>
  );
}
export function SignatureForm({
  users,
  initialUser,
  existing,
}: {
  users: { id: string; name: string }[];
  initialUser: string;
  existing: { id: string; userId: string }[];
}) {
  const [state, action, pending] = useActionState(settingsAction, { error: "", message: "" });
  const [userId, setUserId] = useState(initialUser);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const submitted = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const src = URL.createObjectURL(file);
    setPreview(src);
    return () => URL.revokeObjectURL(src);
  }, [file]);
  const current = existing.find((s) => s.userId === userId);
  const selectFile = (value: File | null) => {
    setError("");
    if (!value) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(value.type) ||
      value.size > 5 * 1024 * 1024
    ) {
      setError("Use a PNG, JPEG or WebP image up to 5 MB.");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(value);
    if (submitted.current) submitted.current.files = transfer.files;
    setFile(value);
  };
  return (
    <form action={action} className="grid gap-4 rounded-xl border border-[var(--edge)] p-4">
      <input type="hidden" name="operation" value="signature" />
      <h2 className="text-xl font-semibold">User Signature</h2>
      <label>
        Select User
        <select
          name="userId"
          className="input mt-1"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setFile(null);
            if (submitted.current) submitted.current.value = "";
          }}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="btn cursor-pointer">
          Take Photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              selectFile(e.target.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <label className="btn cursor-pointer">
          Upload Signature
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              selectFile(e.target.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <input
          ref={submitted}
          type="file"
          name="signature"
          required
          className="sr-only"
          tabIndex={-1}
          aria-label="Selected signature file"
        />
      </div>
      {(preview || current) && (
        <div className="rounded-lg bg-white p-3">
          {/* biome-ignore lint/performance/noImgElement: uploaded/private authenticated signature image. */}
          <img
            src={preview || `/api/user-signatures/${current?.id}`}
            alt="Signature preview"
            className="h-28 w-full object-contain"
          />
        </div>
      )}
      <p className="text-sm text-[var(--muted)]">
        PNG, JPEG or WebP up to 5 MB. Your signature is stored privately and used on authorized
        printed documents.
      </p>
      {(error || state.error) && <p role="alert">{error || state.error}</p>}
      {state.message && <p role="status">{state.message}</p>}
      <button type="submit" className="btn" disabled={pending || !file || !!error}>
        Save Signature
      </button>
    </form>
  );
}
