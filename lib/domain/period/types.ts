/**
 * Global period model types. The period selector is a single shared control
 * used across Dashboard, Cash Flow, Variance, Forecast, Reports and Portfolio;
 * one period state drives every page.
 *
 * FY vs YTD labeling is data-driven by PeriodContext (currentYear +
 * latestActualMonth), exactly like the prototype's `currentYear=2026`,
 * `latestActualMonth=5` (June, 0-indexed).
 */

export type PeriodMode = "month" | "quarter" | "year" | "custom" | "multiyear";

export interface PeriodState {
  mode: PeriodMode;
  /** 0-11 */
  month: number;
  year: number;
  /** 1-4 */
  quarter: number;
  custom: { sm: number; sy: number; em: number; ey: number };
  multi: { sy: number; ey: number };
}

export type PeriodSpec =
  | { mode: "month"; month: number }
  | { mode: "quarter"; quarter: number }
  | { mode: "year"; ytd: boolean }
  | { mode: "custom"; lo: number; hi: number; sy: number; ey: number }
  | { mode: "multiyear"; sy: number; ey: number };

export interface ResolvedPeriod {
  spec: PeriodSpec;
  /** Human label, e.g. "June 2026", "Q2 2026", "FY2025", "2026 YTD". */
  label: string;
  /** Period scale relative to a single month (1 = one month). */
  factor: number;
}

export interface PeriodContext {
  /** The year still in progress (actuals incomplete -> YTD, not FY). */
  currentYear: number;
  /** Last closed actual month, 0-indexed (5 = June). */
  latestActualMonth: number;
}
