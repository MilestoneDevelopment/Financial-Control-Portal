import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePeriod, defaultPeriodState, DEFAULT_PERIOD_CONTEXT } from "./model.ts";
import type { PeriodState } from "./types.ts";

const ctx = DEFAULT_PERIOD_CONTEXT; // currentYear 2026, latestActualMonth 5 (June)

function state(over: Partial<PeriodState>): PeriodState {
  return { ...defaultPeriodState(ctx), ...over };
}

test("month: label + factor 1", () => {
  const r = resolvePeriod(state({ mode: "month", month: 5, year: 2026 }), ctx);
  assert.equal(r.label, "June 2026");
  assert.equal(r.factor, 1);
});

test("quarter: factor 3", () => {
  const r = resolvePeriod(state({ mode: "quarter", quarter: 2, year: 2026 }), ctx);
  assert.equal(r.label, "Q2 2026");
  assert.equal(r.factor, 3);
});

test("year: current incomplete year is YTD, closed year is FY", () => {
  assert.equal(resolvePeriod(state({ mode: "year", year: 2026 }), ctx).label, "2026 YTD");
  assert.equal(resolvePeriod(state({ mode: "year", year: 2025 }), ctx).label, "FY2025");
});

test("multiyear: factor counts elapsed months (2026 = 6 YTD)", () => {
  const r = resolvePeriod(state({ mode: "multiyear", multi: { sy: 2023, ey: 2026 } }), ctx);
  assert.equal(r.label, "2023-2026");
  // 2023..2025 full (12*3=36) + 2026 YTD (6) = 42
  assert.equal(r.factor, 42);
});

test("custom: single-year range label + factor", () => {
  const r = resolvePeriod(
    state({ mode: "custom", custom: { sm: 0, sy: 2026, em: 5, ey: 2026 } }),
    ctx,
  );
  assert.equal(r.label, "Jan-Jun 2026");
  assert.equal(r.factor, 6);
});
