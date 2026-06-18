/**
 * Pure accounting-period lifecycle logic (no server/DB imports - testable).
 *
 * draft -> active -> locked -> closed -> archived.
 * Mutations to locked/closed periods require Correction Mode (separate, audited).
 */
import type { Database } from "@/db/types";

export type PeriodStatus = Database["public"]["Enums"]["period_status"];

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  draft: "Draft",
  active: "Active / In Review",
  locked: "Locked",
  closed: "Closed",
  archived: "Archived",
};

/** Allowed lifecycle transitions (gated by the period.approve_lock capability). */
export const ALLOWED_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  draft: ["active"],
  active: ["draft", "locked"],
  locked: ["active", "closed"],
  closed: ["locked", "archived"],
  archived: [],
};

export function canTransition(from: PeriodStatus, to: PeriodStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface PeriodMutabilityInput {
  status: PeriodStatus;
  is_correction_mode: boolean;
}

/**
 * Mutable (uploads, classification, structure-for-period, etc.) when draft/active,
 * or locked/closed WITH correction mode enabled.
 */
export function isPeriodMutable(p: PeriodMutabilityInput): boolean {
  if (p.status === "draft" || p.status === "active") return true;
  if ((p.status === "locked" || p.status === "closed") && p.is_correction_mode) return true;
  return false;
}

export function requirePeriodMutable(p: PeriodMutabilityInput): void {
  if (!isPeriodMutable(p)) {
    throw new Error(
      "Period is locked/closed. Enable Correction Mode (with a reason) to make changes.",
    );
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function periodLabel(p: { year: number; month: number | null }): string {
  if (p.month && p.month >= 1 && p.month <= 12) return `${MONTHS[p.month - 1]} ${p.year}`;
  return String(p.year);
}
