"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function MasterSearch({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function update(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (next.trim()) params.set("q", next.trim());
      else params.delete("q");
      params.delete("page");
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
    }, 280);
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <div className="flex w-full min-w-0 max-w-xl flex-col gap-2 min-[360px]:flex-row">
      <input
        value={value}
        onChange={(event) => update(event.target.value)}
        placeholder="Search brand or model"
        className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3"
      />
      {value && (
        <button
          type="button"
          onClick={() => update("")}
          className="min-h-11 shrink-0 rounded-lg border border-[var(--edge)] px-4"
        >
          Clear
        </button>
      )}
    </div>
  );
}
