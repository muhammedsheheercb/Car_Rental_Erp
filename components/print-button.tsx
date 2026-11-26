"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
export function PrintButton() {
  const tCommon = useTranslations("common");
  const tDoc = useTranslations("documents");
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
      setError(tDoc("signatureUnavailableError"));
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="print:hidden">
      <button type="button" className="rounded-lg border p-3" disabled={pending} onClick={print}>
        {pending ? tCommon("preparing") : tCommon("printA4")}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
