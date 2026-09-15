"use client";
import { useEffect, useRef, useState } from "react";

type Selected = { file: File; url: string; width: number; height: number };
const allowed = ["image/jpeg", "image/png", "image/webp"];
export function DocumentPicker({
  label,
  required = false,
  existing,
}: {
  label: string;
  required?: boolean;
  existing?: { objectKey: string; contentType: string; sizeBytes: number };
}) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      if (selected) URL.revokeObjectURL(selected.url);
    },
    [selected],
  );
  const select = (file?: File) => {
    setError("");
    if (!file) return;
    if (!allowed.includes(file.type)) return setError("Use a JPEG, PNG, or WebP image.");
    if (file.size > 10 * 1024 * 1024) return setError("Image must be 10 MB or smaller.");
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(url);
        setError("This image could not be read.");
        return;
      }
      setSelected((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { file, url, width: image.naturalWidth, height: image.naturalHeight };
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("This image could not be read.");
    };
    image.src = url;
  };
  return (
    <div className="rounded-xl border border-[var(--edge)] p-4">
      <p className="font-medium">
        {label}
        {required ? " *" : ""}
      </p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Private R2 image · JPEG, PNG, or WebP · maximum 10 MB
      </p>
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
                }}
                className="min-h-9 px-2 text-red-300"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : existing ? (
        <div className="mt-3 rounded-lg border border-[var(--edge)] bg-black/20 p-3 text-sm">
          <p className="font-medium text-[var(--accent)]">Existing private document</p>
          <p className="mt-1 break-all text-xs text-[var(--muted)]">{existing.objectKey}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {existing.contentType} · {(existing.sizeBytes / 1024 / 1024).toFixed(2)} MB
          </p>
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="mt-3 min-h-10 rounded-lg border border-[var(--edge)] px-3"
          >
            Replace
          </button>
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
              onChange={(e) => select(e.target.files?.[0])}
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
        onChange={(e) => select(e.target.files?.[0])}
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
              src={selected?.url ?? ""}
              alt={`${label} full preview`}
              className="max-h-[80dvh] rounded-xl object-contain"
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
