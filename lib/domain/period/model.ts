/**
 * Pure period resolution - a faithful port of the prototype's `periodModel`
 * (the spec/label/factor parts). The interactive selector UI (`ctl`) is built
 * on top of this in a later phase; the math lives here so it is testable and
 * reused by every module.
 */
import type {
  PeriodContext,
  PeriodSpec,
  PeriodState,
  ResolvedPeriod,
} from "./types.ts";

export const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** Default context (matches the frozen prototype). Real value is data-driven. */
export const DEFAULT_PERIOD_CONTEXT: PeriodContext = {
  currentYear: 2026,
  latestActualMonth: 5, // June, 0-indexed
};

export function defaultPeriodState(
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
): PeriodState {
  return {
    mode: "month",
    month: ctx.latestActualMonth,
    year: ctx.currentYear,
    quarter: Math.floor(ctx.latestActualMonth / 3) + 1,
    custom: { sm: 0, sy: ctx.currentYear, em: ctx.latestActualMonth, ey: ctx.currentYear },
    multi: { sy: ctx.currentYear - 3, ey: ctx.currentYear },
  };
}

/** Months that count as elapsed within a given year, per the actuals cutoff. */
export function monthsInYear(year: number, ctx: PeriodContext): number {
  if (year < ctx.currentYear) return 12; // closed year
  if (year === ctx.currentYear) return ctx.latestActualMonth + 1; // YTD
  return 12; // future / forecast year
}

export function resolvePeriod(
  state: PeriodState,
  ctx: PeriodContext = DEFAULT_PERIOD_CONTEXT,
): ResolvedPeriod {
  const M = MONTHS;

  switch (state.mode) {
    case "month":
      return {
        spec: { mode: "month", month: state.month },
        label: `${MONTH_FULL[state.month]} ${state.year}`,
        factor: 1,
      };

    case "quarter":
      return {
        spec: { mode: "quarter", quarter: state.quarter },
        label: `Q${state.quarter} ${state.year}`,
        factor: 3,
      };

    case "year": {
      const ytd = state.year >= ctx.currentYear;
      return {
        spec: { mode: "year", ytd },
        label: ytd ? `${state.year} YTD` : `FY${state.year}`,
        factor: 12,
      };
    }

    case "custom": {
      const c = state.custom;
      const lo = Math.min(c.sm, c.em);
      const hi = Math.max(c.sm, c.em);
      const label =
        c.sy === c.ey
          ? `${M[lo]}-${M[hi]} ${c.sy}`
          : `${M[c.sm]} ${c.sy}-${M[c.em]} ${c.ey}`;
      const factor = hi - lo + 1 + (c.ey > c.sy ? 12 * (c.ey - c.sy) : 0);
      return { spec: { mode: "custom", lo, hi, sy: c.sy, ey: c.ey }, label, factor };
    }

    case "multiyear": {
      const m = state.multi;
      let factor = 0;
      for (let y = m.sy; y <= m.ey; y++) factor += monthsInYear(y, ctx);
      return {
        spec: { mode: "multiyear", sy: m.sy, ey: m.ey },
        label: `${m.sy}-${m.ey}`,
        factor,
      };
    }
  }
}
