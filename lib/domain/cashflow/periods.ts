/**
 * Pure period-aware cash-flow helpers (no DB / server imports - testable).
 *
 * Phase 4B: a selected accounting period drives the generation date range, and an
 * opening -> closing balance chain links consecutive periods. Opening balances are
 * never invented: a period's closing can be *offered* as the next period's
 * "carried" opening candidate, but applying it is a separate, controlled action.
 */
import type { Database } from "@/db/types";

export type PeriodStatus = Database["public"]["Enums"]["period_status"];
export type OpeningBalanceSource = Database["public"]["Enums"]["opening_balance_source"];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface PeriodDateRange {
  dateFrom: string; // inclusive YYYY-MM-DD
  dateTo: string; // inclusive YYYY-MM-DD
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Last calendar day of a 1-12 month (day 0 of the next month). */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Concrete inclusive range + label for a period (single month, or whole year). */
export function periodDateRange(year: number, month: number | null): PeriodDateRange {
  if (month === null) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`, label: `FY${year}` };
  }
  return {
    dateFrom: `${year}-${pad(month)}-01`,
    dateTo: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    label: `${MONTHS[month - 1]} ${year}`,
  };
}

/**
 * Year-to-date range: from the fiscal year start (Jan 1) through the end of the
 * selected month (or the whole year when no month is given).
 */
export function ytdDateRange(year: number, month: number | null): PeriodDateRange {
  if (month === null) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`, label: `FY${year}` };
  }
  return {
    dateFrom: `${year}-01-01`,
    dateTo: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    label: `${year} YTD (through ${MONTHS[month - 1]})`,
  };
}

export interface PeriodLike {
  id: string;
  year: number;
  month: number | null;
  status: PeriodStatus;
  openingBalance: number | null;
  openingBalanceSource: OpeningBalanceSource | null;
  closingBalance: number | null;
}

/** Chronological order: by year, then month (a year-level period sorts first). */
export function comparePeriods(a: PeriodLike, b: PeriodLike): number {
  if (a.year !== b.year) return a.year - b.year;
  return (a.month ?? 0) - (b.month ?? 0);
}

/**
 * The periods immediately before/after the selected one, chronologically.
 * Generic so callers keep their richer period shape (e.g. with date ranges).
 */
export function adjacentPeriods<T extends PeriodLike>(
  periods: T[],
  selectedId: string,
): { previous: T | null; next: T | null } {
  const sorted = [...periods].sort(comparePeriods);
  const idx = sorted.findIndex((p) => p.id === selectedId);
  if (idx === -1) return { previous: null, next: null };
  return {
    previous: idx > 0 ? sorted[idx - 1] : null,
    next: idx < sorted.length - 1 ? sorted[idx + 1] : null,
  };
}

/** Locked or closed periods are read-only without Correction Mode. */
export function isLockedOrClosed(status: PeriodStatus): boolean {
  return status === "locked" || status === "closed";
}

export type OpeningState =
  | "manual"
  | "carried"
  | "imported"
  | "carried-candidate"
  | "missing";

export interface OpeningResolution {
  /** What we know about the opening balance for the selected period. */
  state: OpeningState;
  /** The effective opening balance to use, or null when none is set. */
  value: number | null;
  /** A carried opening available to accept (only when state is carried-candidate). */
  candidate: number | null;
}

/**
 * Resolve the opening balance for the selected period without inventing one.
 *
 *  - A stored opening balance wins (its source labels it manual/carried/imported).
 *  - Otherwise, if the previous period has a known closing, offer it as a
 *    carried *candidate* (not applied - value stays null, closing stays uncomputed).
 *  - Otherwise it is missing.
 *
 * A manual opening therefore always overrides a carried candidate.
 */
export function resolveOpeningBalance(input: {
  openingBalance: number | null;
  openingBalanceSource: OpeningBalanceSource | null;
  previousClosing: number | null;
}): OpeningResolution {
  if (input.openingBalance !== null) {
    const state: OpeningState = input.openingBalanceSource ?? "manual";
    return { state, value: input.openingBalance, candidate: null };
  }
  if (input.previousClosing !== null) {
    return { state: "carried-candidate", value: null, candidate: input.previousClosing };
  }
  return { state: "missing", value: null, candidate: null };
}

export const OPENING_STATE_LABEL: Record<OpeningState, string> = {
  manual: "manual",
  carried: "carried",
  imported: "imported",
  "carried-candidate": "carried (available)",
  missing: "not set",
};
