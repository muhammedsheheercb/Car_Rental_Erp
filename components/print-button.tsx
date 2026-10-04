"use client";
import { useState } from "react";
export function PrintButton() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const print = async () => {
    setPending(true);
    setError("");
    try {
      await document.fonts.ready;
      const images = [...document.querySelectorAll<HTMLImageElement>(".print-document img")];
      await Promise.all(images.map((img) => img.decode()));
      window.print();
    } catch {
      setError("A signature image is unavailable. Reload the document before printing.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="print:hidden">
      <button type="button" className="rounded-lg border p-3" disabled={pending} onClick={print}>
        {pending ? "Preparing…" : "Print A4"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
