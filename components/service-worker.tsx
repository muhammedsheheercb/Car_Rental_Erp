"use client";

import { useEffect, useState } from "react";

export function ServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (registration.waiting) setWaiting(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            installing?.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller)
                setWaiting(registration.waiting);
            });
          });
        })
        .catch(() => undefined);
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
    }
  }, []);
  if (!waiting) return null;
  return (
    <div
      className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 border border-[var(--edge)] bg-[var(--raised)] p-3 text-sm shadow-2xl md:bottom-4"
      role="status"
    >
      <span>A new version is ready.</span>
      <button
        type="button"
        onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}
        className="min-h-10 bg-[var(--accent)] px-3 font-semibold text-black"
      >
        Update
      </button>
    </div>
  );
}
