"use client";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { settingsAction } from "@/app/[locale]/(protected)/settings/actions";
import { translateValidation } from "@/lib/i18n-helpers";
import { compressImageFile } from "@/lib/image-compress";

export function AlertSettingsForm({
  nearServiceKm,
  expirySoonDays,
}: {
  nearServiceKm: number;
  expirySoonDays: number;
}) {
  const t = useTranslations();
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(settingsAction, { error: "", message: "" });
  return (
    <form
      action={action}
      className="grid gap-4 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
    >
      <input type="hidden" name="operation" value="alerts" />
      <div>
        <h2 className="text-lg font-semibold">{tSettings("alertThresholdsTitle")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{tSettings("alertThresholdsSubtitle")}</p>
      </div>
      <label className="block text-sm">
        {tSettings("nearServiceKmLabel")}
        <input
          name="nearServiceKm"
          inputMode="numeric"
          pattern="[0-9]+"
          defaultValue={nearServiceKm}
          required
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
        />
      </label>
      <label className="block text-sm">
        {tSettings("expirySoonDaysLabel")}
        <input
          name="expirySoonDays"
          inputMode="numeric"
          pattern="[0-9]+"
          defaultValue={expirySoonDays}
          required
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
        />
      </label>
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
      <button
        type="submit"
        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:opacity-50"
        disabled={pending}
      >
        {pending ? tCommon("saving") : tSettings("saveThresholds")}
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
  const t = useTranslations();
  const tSettings = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [state, action, pending] = useActionState(settingsAction, { error: "", message: "" });
  const [userId, setUserId] = useState(initialUser);
  const [file, setFile] = useState<File | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const submitted = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

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

  const attachFile = (nextFile: File, width?: number, height?: number) => {
    const transfer = new DataTransfer();
    transfer.items.add(nextFile);
    if (submitted.current) submitted.current.files = transfer.files;
    setFile(nextFile);
    setDimensions(width && height ? { width, height } : null);
  };

  const selectFile = async (value: File | null) => {
    setError("");
    if (!value) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(value.type) ||
      value.size > 10 * 1024 * 1024
    ) {
      setError(translateValidation(t, "Use a PNG, JPEG or WebP image up to 5 MB."));
      return;
    }
    setCompressing(true);
    try {
      const compressed = await compressImageFile(value, {
        maxDimension: 1400,
        quality: 0.85,
        maxInputBytes: 10 * 1024 * 1024,
        maxOutputBytes: 5 * 1024 * 1024,
        preserveTransparency: true,
      });
      attachFile(compressed.file, compressed.width, compressed.height);
    } catch (cause) {
      const raw =
        cause instanceof Error ? cause.message : "Use a PNG, JPEG or WebP image up to 5 MB.";
      setError(translateValidation(t, raw));
    } finally {
      setCompressing(false);
    }
  };

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPoint(event);
    const ctx = canvasRef.current?.getContext("2d");
    if (!point || !ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = "#111827";
    ctx.fill();
    setHasStrokes(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = getPoint(event);
    const prev = lastPointRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!point || !prev || !ctx) return;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearPad = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const applyDrawing = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    setError("");
    canvas.toBlob((blob) => {
      if (!blob) {
        setError(translateValidation(t, "Could not capture drawn signature. Please try again."));
        return;
      }
      const drawn = new File([blob], "drawn-signature.png", {
        type: "image/png",
        lastModified: Date.now(),
      });
      attachFile(drawn, canvas.width, canvas.height);
    }, "image/png");
  };

  return (
    <form
      action={action}
      className="grid gap-5 rounded-2xl border border-[var(--edge)] bg-[var(--surface)] p-5"
    >
      <input type="hidden" name="operation" value="signature" />
      <div>
        <h2 className="text-lg font-semibold">{tSettings("userSignature")}</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">{tSettings("userSignatureHint")}</p>
      </div>

      <label className="block text-sm">
        {tSettings("selectUser")}
        <select
          name="userId"
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
          value={userId}
          onChange={(e) => {
            setUserId(e.target.value);
            setFile(null);
            setDimensions(null);
            setError("");
            clearPad();
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

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{tSettings("drawSignature")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearPad}
              disabled={!hasStrokes}
              className="min-h-9 rounded-lg border border-[var(--edge)] px-3 text-xs disabled:opacity-50"
            >
              {tSettings("clearPad")}
            </button>
            <button
              type="button"
              onClick={applyDrawing}
              disabled={!hasStrokes}
              className="min-h-9 rounded-lg border border-[var(--accent)] px-3 text-xs font-medium text-[var(--accent)] disabled:opacity-50"
            >
              {tSettings("useDrawing")}
            </button>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={180}
          aria-label={tSettings("drawSignature")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="h-36 w-full touch-none rounded-xl border border-[var(--edge)] bg-white"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="min-h-11 cursor-pointer content-center rounded-lg border border-[var(--edge)] px-4 text-sm font-medium hover:bg-white/5">
          {tCommon("takePhoto")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              void selectFile(e.target.files?.[0] ?? null);
              e.currentTarget.value = "";
            }}
          />
        </label>
        <label className="min-h-11 cursor-pointer content-center rounded-lg border border-[var(--edge)] px-4 text-sm font-medium hover:bg-white/5">
          {tSettings("uploadSignature")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              void selectFile(e.target.files?.[0] ?? null);
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
          aria-label={tSettings("userSignature")}
        />
      </div>

      {compressing && (
        <p className="text-xs text-[var(--muted)]" role="status">
          {tSettings("optimisingSignature")}
        </p>
      )}

      {(preview || current) && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted)]">
            {preview
              ? `${tSettings("readyToSaveSignature", {
                  name: file?.name ?? "",
                  kb: ((file?.size ?? 0) / 1024).toFixed(1),
                })}${dimensions ? ` · ${dimensions.width}×${dimensions.height}` : ""}`
              : tSettings("currentlySavedSignature")}
          </p>
          <div className="rounded-xl bg-white p-3">
            {/* biome-ignore lint/performance/noImgElement: uploaded/private authenticated signature image. */}
            <img
              src={preview || `/api/user-signatures/${current?.id}`}
              alt={tSettings("userSignature")}
              className="h-28 w-full object-contain"
            />
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">{tSettings("signatureStorageNote")}</p>

      {(error || state.error) && (
        <p role="alert" className="text-sm text-red-300">
          {error || translateValidation(t, state.error)}
        </p>
      )}
      {state.message && (
        <p role="status" className="text-sm text-[var(--accent)]">
          {translateValidation(t, state.message)}
        </p>
      )}
      <button
        type="submit"
        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-black disabled:opacity-50"
        disabled={pending || compressing || !file || !!error}
      >
        {pending ? tCommon("saving") : tSettings("saveSignature")}
      </button>
    </form>
  );
}
