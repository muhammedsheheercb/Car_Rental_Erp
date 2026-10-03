import { formatOmanDateTime, parseOmanDateTime } from "./booking-calculations";
export function omanDayBounds(now: Date) {
  const start = parseOmanDateTime(`${formatOmanDateTime(now).slice(0, 10)}T00:00`);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}
export function formatLateDuration(expected: Date, now: Date): string {
  const elapsed = now.getTime() - expected.getTime();
  if (elapsed <= 0) return "On time";
  const minutes = Math.floor(elapsed / 60_000);
  if (!minutes) return "Less than a minute late";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} late`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} late`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return `${days} day${days === 1 ? "" : "s"}${remainder ? ` ${remainder} hour${remainder === 1 ? "" : "s"}` : ""} late`;
}
