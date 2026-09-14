"use client";
import * as Toast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "success" | "error" | "warning" | "info" | "loading";
type Notice = { text: string; tone: Tone };
type Notifications = {
  show: (text: string, tone?: Tone, key?: string) => void;
  loading: (text: string, key: string) => void;
  complete: (key: string, text: string, tone?: Exclude<Tone, "loading">) => void;
};
const ToastContext = createContext<Notifications>({
  show: () => undefined,
  loading: () => undefined,
  complete: () => undefined,
});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const currentKey = useRef("");
  const show = useCallback((text: string, tone: Tone = "success", key = text) => {
    if (currentKey.current === key) return;
    currentKey.current = key;
    setNotice({ text, tone });
  }, []);
  const loading = useCallback((text: string, key: string) => {
    currentKey.current = key;
    setNotice({ text, tone: "loading" });
  }, []);
  const complete = useCallback(
    (key: string, text: string, tone: Exclude<Tone, "loading"> = "success") => {
      if (currentKey.current === key) setNotice({ text, tone });
    },
    [],
  );
  const icon =
    notice?.tone === "success"
      ? "✓"
      : notice?.tone === "error"
        ? "!"
        : notice?.tone === "loading"
          ? "◌"
          : "i";
  return (
    <ToastContext.Provider value={{ show, loading, complete }}>
      <Toast.Provider>
        {children}
        <Toast.Root
          open={Boolean(notice)}
          duration={notice?.tone === "loading" ? Infinity : 4500}
          onOpenChange={(open) => {
            if (!open) {
              setNotice(null);
              currentKey.current = "";
            }
          }}
          className={`fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[70] flex items-center gap-3 rounded-xl border px-4 py-3 shadow-2xl sm:inset-x-auto sm:right-4 sm:max-w-md md:bottom-4 ${notice?.tone === "error" ? "border-red-400/40 bg-red-950 text-red-100" : notice?.tone === "warning" ? "border-amber-300/40 bg-amber-950 text-amber-100" : "border-[var(--accent)]/40 bg-[var(--raised)]"}`}
        >
          <span aria-hidden="true" className="grid h-5 w-5 place-items-center font-bold">
            {icon}
          </span>
          <Toast.Title className="text-sm font-medium">{notice?.text}</Toast.Title>
          <Toast.Close
            aria-label="Dismiss notification"
            className="ms-auto min-h-8 px-1 text-[var(--muted)]"
          >
            ×
          </Toast.Close>
        </Toast.Root>
        <Toast.Viewport />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
