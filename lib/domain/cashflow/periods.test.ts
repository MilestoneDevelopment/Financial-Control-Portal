import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodDateRange,
  ytdDateRange,
  adjacentPeriods,
  comparePeriods,
  isLockedOrClosed,
  resolveOpeningBalance,
  validatePeriodInput,
  validateOpeningBalanceAmount,
  canEditOpeningBalance,
  type PeriodLike,
} from "./periods.ts";
import { buildCashFlowTree, computeClosingBalance } from "./generate.ts";
import type { CashFlowNode, CashFlowTxn } from "./types.ts";

function period(p: Partial<PeriodLike> & Pick<PeriodLike, "id" | "year">): PeriodLike {
  return {
    month: null,
    status: "active",
    isCorrectionMode: false,
    openingBalance: null,
    openingBalanceSource: null,
    closingBalance: null,
    ...p,
  };
}

test("periodDateRange: month yields whole-month bounds; null month yields whole year", () => {
  assert.deepEqual(periodDateRange(2026, 6), {
    dateFrom: "2026-06-01",
    dateTo: "2026-06-30",
    label: "Jun 2026",
  });
  // February leap-year handling via day-0-of-next-month.
  assert.equal(periodDateRange(2024, 2).dateTo, "2024-02-29");
  assert.deepEqual(periodDateRange(2025, null), {
    dateFrom: "2025-01-01",
    dateTo: "2025-12-31",
    label: "FY2025",
  });
});

test("selected period drives the transaction date range", () => {
  // A June period must scope generation to June only.
  const r = periodDateRange(2026, 6);
  const nodes: CashFlowNode[] = [
    { id: "s", kind: "section", label: "Op", parentId: null, sortOrder: 0, cashDirection: "neutral", isActive: true },
    { id: "g", kind: "group", label: "Rev", parentId: "s", sortOrder: 0, cashDirection: "neutral", isActive: true },
    { id: "c", kind: "class", label: "Sales", parentId: "g", sortOrder: 0, cashDirection: "in", isActive: true },
  ];
  const inJune = "2026-06-13" >= r.dateFrom && "2026-06-13" <= r.dateTo;
  const inJuly = "2026-07-02" >= r.dateFrom && "2026-07-02" <= r.dateTo;
  assert.equal(inJune, true);
  assert.equal(inJuly, false);
  // Sanity: the generator sums whatever range-filtered txns it is handed.
  const txns: CashFlowTxn[] = [
    { id: "t", classId: "c", status: "confirmed", source: "rule", amountGel: 500, fxStatus: "not_required" },
  ];
  assert.equal(buildCashFlowTree(nodes, txns).net, 500);
});

test("ytdDateRange: sums from fiscal year start through the selected month", () => {
  assert.deepEqual(ytdDateRange(2026, 6), {
    dateFrom: "2026-01-01",
    dateTo: "2026-06-30",
    label: "2026 YTD (through Jun)",
  });
  assert.equal(ytdDateRange(2026, null).dateFrom, "2026-01-01");
});

test("opening + net = closing; missing opening does not invent closing", () => {
  assert.equal(computeClosingBalance(1000, 250), 1250);
  assert.equal(computeClosingBalance(null, 250), null);
});

test("resolveOpeningBalance: previous closing becomes a carried candidate", () => {
  const r = resolveOpeningBalance({
    openingBalance: null,
    openingBalanceSource: null,
    previousClosing: 1750,
  });
  assert.equal(r.state, "carried-candidate");
  assert.equal(r.value, null); // not applied automatically
  assert.equal(r.candidate, 1750);
});

test("resolveOpeningBalance: manual opening overrides a carried candidate", () => {
  const r = resolveOpeningBalance({
    openingBalance: 900,
    openingBalanceSource: "manual",
    previousClosing: 1750,
  });
  assert.equal(r.state, "manual");
  assert.equal(r.value, 900);
  assert.equal(r.candidate, null);
});

test("resolveOpeningBalance: missing when no opening and no previous closing", () => {
  const r = resolveOpeningBalance({ openingBalance: null, openingBalanceSource: null, previousClosing: null });
  assert.equal(r.state, "missing");
  assert.equal(r.value, null);
  assert.equal(r.candidate, null);
});

test("resolveOpeningBalance: stored carried/imported keep their source label", () => {
  assert.equal(
    resolveOpeningBalance({ openingBalance: 500, openingBalanceSource: "carried", previousClosing: null }).state,
    "carried",
  );
  assert.equal(
    resolveOpeningBalance({ openingBalance: 500, openingBalanceSource: "imported", previousClosing: 999 }).state,
    "imported",
  );
});

test("adjacentPeriods: previous/next resolved chronologically regardless of input order", () => {
  const periods = [
    period({ id: "jun", year: 2026, month: 6 }),
    period({ id: "apr", year: 2026, month: 4 }),
    period({ id: "may", year: 2026, month: 5 }),
  ];
  const { previous, next } = adjacentPeriods(periods, "may");
  assert.equal(previous?.id, "apr");
  assert.equal(next?.id, "jun");
  // Edges.
  assert.equal(adjacentPeriods(periods, "apr").previous, null);
  assert.equal(adjacentPeriods(periods, "jun").next, null);
  assert.equal(adjacentPeriods(periods, "ghost").previous, null);
});

test("comparePeriods + isLockedOrClosed", () => {
  assert.ok(comparePeriods(period({ id: "a", year: 2025, month: 12 }), period({ id: "b", year: 2026, month: 1 })) < 0);
  assert.equal(isLockedOrClosed("locked"), true);
  assert.equal(isLockedOrClosed("closed"), true);
  assert.equal(isLockedOrClosed("active"), false);
  assert.equal(isLockedOrClosed("draft"), false);
});

test("validatePeriodInput: accepts valid month/year; rejects out-of-range", () => {
  assert.deepEqual(validatePeriodInput({ year: 2026, month: 6 }), { year: 2026, month: 6 });
  assert.deepEqual(validatePeriodInput({ year: 2026, month: null }), { year: 2026, month: null });
  assert.throws(() => validatePeriodInput({ year: 1999, month: 1 }), /Year must be/);
  assert.throws(() => validatePeriodInput({ year: 2026, month: 0 }), /Month must be/);
  assert.throws(() => validatePeriodInput({ year: 2026, month: 13 }), /Month must be/);
  assert.throws(() => validatePeriodInput({ year: 2026.5, month: 1 }), /Year must be/);
});

test("canEditOpeningBalance: editable for draft/active; locked/closed need correction mode", () => {
  // Editable states.
  assert.equal(canEditOpeningBalance({ status: "draft", isCorrectionMode: false }), true);
  assert.equal(canEditOpeningBalance({ status: "active", isCorrectionMode: false }), true);
  // Locked / closed are blocked unless Correction Mode is on.
  assert.equal(canEditOpeningBalance({ status: "locked", isCorrectionMode: false }), false);
  assert.equal(canEditOpeningBalance({ status: "closed", isCorrectionMode: false }), false);
  assert.equal(canEditOpeningBalance({ status: "locked", isCorrectionMode: true }), true);
  assert.equal(canEditOpeningBalance({ status: "closed", isCorrectionMode: true }), true);
  // Archived is never editable, even with the flag.
  assert.equal(canEditOpeningBalance({ status: "archived", isCorrectionMode: true }), false);
});

test("validateOpeningBalanceAmount: rounds to 2 dp; rejects non-finite", () => {
  assert.equal(validateOpeningBalanceAmount(1250.5), 1250.5);
  assert.equal(validateOpeningBalanceAmount(1250.005), 1250.01);
  assert.equal(validateOpeningBalanceAmount(-200), -200);
  assert.throws(() => validateOpeningBalanceAmount(Number.NaN), /valid number/);
  assert.throws(() => validateOpeningBalanceAmount(Infinity), /valid number/);
});

test("carried chain: prev closing (prevOpening + prevNet) feeds current candidate", () => {
  // Previous period: opening 1000, net 750 -> closing 1750.
  const prevClosing = computeClosingBalance(1000, 750);
  const r = resolveOpeningBalance({
    openingBalance: null,
    openingBalanceSource: null,
    previousClosing: prevClosing,
  });
  assert.equal(r.candidate, 1750);
  // If the previous period itself had no opening, no closing -> no candidate.
  const noPrev = resolveOpeningBalance({
    openingBalance: null,
    openingBalanceSource: null,
    previousClosing: computeClosingBalance(null, 750),
  });
  assert.equal(noPrev.state, "missing");
});
