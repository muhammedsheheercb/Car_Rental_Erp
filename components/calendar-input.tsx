"use client";
import { useRef } from "react";

export function CalendarInput({
  id,
  name,
  type = "date",
  value,
  onChange,
  min,
  required = false,
  disabled = false,
  readOnly = false,
  className = "",
  wrapperClassName = "mt-2",
}: {
  id: string;
  name?: string;
  type?: "date" | "datetime-local";
  value: string;
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  wrapperClassName?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    if (disabled || readOnly) return;
    const native = input.current;
    if (!native) return;
    native.focus();
    try {
      if (typeof native.showPicker === "function") {
        native.showPicker();
        return;
      }
    } catch {
      /* Fallback to click if showPicker is restricted */
    }
    native.click();
  };
  return (
    <span className={`relative block ${wrapperClassName}`}>
      <input
        id={id}
        name={name}
        ref={input}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        type={type}
        min={min}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`calendar-input min-h-11 w-full rounded-lg border border-[var(--edge)] bg-black/20 px-3 pe-12 ${className}`}
      />
      <button
        type="button"
        aria-label="Open calendar"
        disabled={disabled || readOnly}
        onClick={openPicker}
        className="absolute inset-y-0 end-0 grid w-11 place-items-center text-white opacity-100 hover:text-white focus-visible:text-white active:text-white disabled:opacity-45"
        tabIndex={disabled || readOnly ? -1 : 0}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-current"
          strokeWidth="2"
        >
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
        </svg>
      </button>
    </span>
  );
}
