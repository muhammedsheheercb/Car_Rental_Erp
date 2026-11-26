"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatOmanDateTime } from "@/features/rentals/booking-calculations";

const WEEKDAY_KEYS = ["su", "mo", "tu", "we", "th", "fr", "sa"] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

function parseParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
    dateStr: `${match[1]}-${match[2]}-${match[3]}`,
    hour: match[4],
    minute: match[5],
  };
}

export function OmanDateTimePicker({
  id,
  name,
  label,
  value,
  onChange,
  min,
  required = false,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
}) {
  const tCommon = useTranslations("common");
  const tCal = useTranslations("calendar");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const parsed = parseParts(value);
  const parsedHour = parsed?.hour;
  const parsedMinute = parsed?.minute;
  const minDateStr = min && /^\d{4}-\d{2}-\d{2}/.test(min) ? min.slice(0, 10) : "";

  const [todayStr, setTodayStr] = useState("");
  const [viewYear, setViewYear] = useState(() => parsed?.year ?? 2026);
  const [viewMonth, setViewMonth] = useState(() => parsed?.month ?? 0);
  const [hour, setHour] = useState(() => parsedHour ?? "10");
  const [minute, setMinute] = useState(() => parsedMinute ?? "00");

  useEffect(() => {
    setTodayStr(formatOmanDateTime(new Date()).slice(0, 10));
  }, []);

  useEffect(() => {
    if (parsedHour && parsedMinute) {
      setHour(parsedHour);
      setMinute(parsedMinute);
    }
  }, [parsedHour, parsedMinute]);

  useEffect(() => {
    if (!open) return;
    const currentOman = formatOmanDateTime(new Date());
    setTodayStr(currentOman.slice(0, 10));
    const currentVal = parseParts(value);
    const target = currentVal ?? parseParts(min ?? "") ?? parseParts(currentOman);
    if (target) {
      setViewYear(target.year);
      setViewMonth(target.month);
      if (currentVal) {
        setHour(currentVal.hour);
        setMinute(currentVal.minute);
      }
    }
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, value, min]);

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(viewYear, viewMonth, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const cells: { key: string; day: number | null }[] = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ key: `lead-${viewYear}-${viewMonth}-${i}`, day: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ key: `${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`, day: d });
    }
    let trail = 0;
    while (cells.length % 7 !== 0) {
      cells.push({ key: `trail-${viewYear}-${viewMonth}-${trail++}`, day: null });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const minuteOptions = useMemo(() => {
    const base = ["00", "15", "30", "45"];
    if (!base.includes(minute)) return [...base, minute].sort();
    return base;
  }, [minute]);

  const stepMonth = (delta: number) => {
    const next = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    setViewYear(next.getUTCFullYear());
    setViewMonth(next.getUTCMonth());
  };

  const pickDate = (day: number) => {
    const nextDate = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    onChange(`${nextDate}T${hour}:${minute}`);
  };

  const handleTimeChange = (nextHour: string, nextMinute: string) => {
    setHour(nextHour);
    setMinute(nextMinute);
    const activeDate = parsed?.dateStr ?? (minDateStr > todayStr ? minDateStr : todayStr);
    onChange(`${activeDate}T${nextHour}:${nextMinute}`);
  };

  const pickNowOman = () => {
    const current = formatOmanDateTime(new Date());
    const parts = parseParts(current);
    if (parts) {
      setViewYear(parts.year);
      setViewMonth(parts.month);
      setHour(parts.hour);
      setMinute(parts.minute);
    }
    onChange(current);
  };

  return (
    <div ref={wrapperRef} className="relative grid min-w-0 gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          name={name}
          required={required}
          type="datetime-local"
          min={min}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="calendar-input min-h-11 min-w-0 w-full border border-[var(--edge)] bg-[var(--raised)] px-3 pe-12"
        />
        <button
          type="button"
          aria-label={tCommon("openCalendarFor", { label })}
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute inset-y-0 end-0 grid w-11 place-items-center text-[var(--ink)] hover:text-[var(--accent-ink)] focus-visible:text-[var(--accent-ink)]"
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
      </div>

      {open && (
        <div
          role="dialog"
          aria-label={tCommon("openCalendarFor", { label })}
          className="absolute end-0 top-full z-50 mt-1.5 w-[min(19.5rem,calc(100vw-2rem))] rounded-xl border border-[var(--edge)] bg-[var(--raised)] p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 pb-2">
            <button
              type="button"
              aria-label={tCommon("prevMonth")}
              onClick={() => stepMonth(-1)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--edge)] text-sm hover:border-[var(--accent)]"
            >
              ‹
            </button>
            <span className="text-sm font-semibold">
              {tCal(`months.${String(viewMonth)}`)} {viewYear}
            </span>
            <button
              type="button"
              aria-label={tCommon("nextMonth")}
              onClick={() => stepMonth(1)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--edge)] text-sm hover:border-[var(--accent)]"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[var(--muted)]">
            {WEEKDAY_KEYS.map((dayKey) => (
              <span key={dayKey} className="py-1">
                {tCal(`weekdays.${dayKey}`)}
              </span>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
            {calendarCells.map(({ key, day }) => {
              if (day === null) return <span key={key} />;
              const cellStr = key;
              const isSelected = parsed?.dateStr === cellStr;
              const isToday = todayStr === cellStr;
              const isDisabled = Boolean(minDateStr && cellStr < minDateStr);
              return (
                <button
                  key={cellStr}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => pickDate(day)}
                  className={`grid h-9 place-items-center rounded-lg transition-colors ${
                    isSelected
                      ? "bg-[var(--accent)] font-semibold text-black"
                      : isToday
                        ? "border border-[var(--accent)] text-[var(--accent-ink)] hover:bg-[#EDE8DE]"
                        : "hover:bg-[#EDE8DE]"
                  } disabled:cursor-not-allowed disabled:opacity-30`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-[var(--edge)] pt-3">
            <span className="text-xs text-[var(--muted)]">{tCommon("timeOman")}</span>
            <select
              aria-label={tCommon("hour")}
              value={hour}
              onChange={(e) => handleTimeChange(e.target.value, minute)}
              className="min-h-9 flex-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-2 text-xs"
            >
              {Array.from({ length: 24 }, (_, h) => pad2(h)).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--muted)]">:</span>
            <select
              aria-label={tCommon("minute")}
              value={minute}
              onChange={(e) => handleTimeChange(hour, e.target.value)}
              className="min-h-9 flex-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-2 text-xs"
            >
              {minuteOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={pickNowOman}
              className="min-h-9 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 text-xs font-medium text-[var(--ink)] hover:border-[#9A7B4F]"
            >
              {tCommon("nowOman")}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-black"
            >
              {tCommon("done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
