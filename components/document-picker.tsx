"use client";
import { useEffect, useRef, useState } from "react";
import { compressImageFile } from "@/lib/image-compress";

type Selected = { file: File; url: string; width: number; height: number };

export function DocumentPicker({
  label,
  required = false,
  existing,
  existingUrl: customExistingUrl,
  hint = "Private R2 image · JPEG, PNG, or WebP · compressed automatically (max 5 MB)",
  onChange,
}: {
  label: string;
  required?: boolean;
  existing?: { id: string; objectKey: string; contentType: string; sizeBytes: number };
  existingUrl?: string;
  hint?: string;
  onChange?: (file: File | null, width: number, height: number) => void;
}) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [error, setError] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const existingUrl =
    customExistingUrl ?? (existing ? `/api/customer-documents/${existing.id}` : undefined);
  const previewUrl = selected?.url ?? existingUrl;

  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.url);
    },
    [selected],
  );

  const select = async (file?: File) => {
    setError("");
    if (!file) return;
    setCompressing(true);
    try {
      const optimized = await compressImageFile(file, {
        maxDimension: 2200,
        quality: 0.82,
        maxInputBytes: 10 * 1024 * 1024,
        maxOutputBytes: 5 * 1024 * 1024,
        preserveTransparency: file.type === "image/png",
      });
      const url = URL.createObjectURL(optimized.file);
      setSelected((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { file: optimized.file, url, width: optimized.width, height: optimized.height };
      });
      onChange?.(optimized.file, optimized.width, optimized.height);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This image could not be read.");
    } finally {
      setCompressing(false);
    }
  };

  return (
    <div className="rounded-xl border border-[var(--edge)] p-4">
      <p className="font-medium">
        {label}
        {required ? " *" : ""}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      {compressing && (
        <p className="mt-2 text-xs text-[var(--muted)]" role="status">
          Compressing image…
        </p>
      )}
      {selected ? (
        <div className="mt-3 flex min-w-0 gap-3">
          {/* biome-ignore lint/performance/noImgElement: local object URLs require direct previews */}
          <img
            src={selected.url}
            alt={`${label} preview`}
            className="h-20 w-28 rounded-lg border border-[var(--edge)] object-cover"
          />
          <div className="min-w-0 text-sm">
            <p className="truncate">{selected.file.name}</p>
            <p className="text-xs text-[var(--muted)]">
              {(selected.file.size / 1024 / 1024).toFixed(2)} MB · {selected.width}×
              {selected.height}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="min-h-9 rounded border border-[var(--edge)] px-2"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => picker.current?.click()}
                className="min-h-9 rounded border border-[var(--edge)] px-2"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(selected.url);
                  setSelected(null);
                  onChange?.(null, 0, 0);
                }}
                className="min-h-9 px-2 text-red-300"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : existing ? (
        <div className="mt-3 flex min-w-0 gap-3">
          {/* biome-ignore lint/performance/noImgElement: authenticated private images require direct previews */}
          <img
            src={existingUrl}
            alt={`${label} preview`}
            onLoad={() => setPreviewFailed(false)}
            onError={() => setPreviewFailed(true)}
            className="h-20 w-28 shrink-0 rounded-lg border border-[var(--edge)] object-contain"
          />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Saved image</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {(existing.sizeBytes / 1024 / 1024).toFixed(2)} MB
            </p>
            {previewFailed && (
              <p role="alert" className="mt-1 text-xs text-red-300">
                Could not load the image preview.
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="min-h-9 rounded border border-[var(--edge)] px-2"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => picker.current?.click()}
                className="min-h-9 rounded border border-[var(--edge)] px-2"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="min-h-10 cursor-pointer rounded-lg border border-[var(--edge)] px-3 py-2 text-sm">
            Take photo
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={(e) => {
                void select(e.target.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="min-h-10 rounded-lg border border-[var(--edge)] px-3 text-sm"
          >
            Upload file
          </button>
        </div>
      )}
      <input
        ref={picker}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          void select(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${label} preview`}
          onMouseDown={() => setOpen(false)}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-3"
        >
          <div
            role="document"
            onMouseDown={(e) => e.stopPropagation()}
            className="max-h-full max-w-4xl"
          >
            {/* biome-ignore lint/performance/noImgElement: local object URLs require direct previews */}
            <img
              src={previewUrl}
              alt={`${label} full preview`}
              className="max-h-[80dvh] max-w-full rounded-xl object-contain"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-3 min-h-11 rounded-lg bg-[var(--raised)] px-4"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
