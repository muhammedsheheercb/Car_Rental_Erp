"use client";
import { useState } from "react";
export function BranchCodePreview() {
  const [name, setName] = useState("");
  const code =
    name
      .trim()
      .toLocaleUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 16) || "BRANCH";
  return (
    <>
      <label className="mt-4 block text-sm">
        Name
        <input
          required
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3"
        />
      </label>
      <label className="mt-4 block text-sm">
        Branch code
        <input
          value={code}
          readOnly
          aria-readonly="true"
          className="mt-2 min-h-11 w-full cursor-not-allowed rounded-lg border border-[var(--edge)] bg-black/40 px-3 font-mono text-[var(--muted)]"
        />
      </label>
    </>
  );
}
