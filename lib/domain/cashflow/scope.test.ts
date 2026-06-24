import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quarterRange,
  halfRange,
  fyRange,
  resolveStatementScopeKind,
  resolveShowZero,
  defaultShowZero,
  parseQuarters,
  quartersDateRange,
  quarterOfMonth,
  formatQuartersLabel,
  pruneZeroRows,
  aggregatePeriodBridge,
} from "./scope.ts";
import type { CashFlowStatement, CashFlowTreeNode } from "./types.ts";

test("quarterRange: Q1-Q4 calendar bounds", () => {
  assert.deepEqual(quarterRange(2025, 1), { dateFrom: "2025-01-01", dateTo: "2025-03-31" });
  assert.deepEqual(quarterRange(2025, 2), { dateFrom: "2025-04-01", dateTo: "2025-06-30" });
  assert.deepEqual(quarterRange(2025, 3), { dateFrom: "2025-07-01", dateTo: "2025-09-30" });
  assert.deepEqual(quarterRange(2024, 4), { dateFrom: "2024-10-01", dateTo: "2024-12-31" });
});

test("halfRange: H1 Jan-Jun, H2 Jul-Dec", () => {
  assert.deepEqual(halfRange(2025, 1), { dateFrom: "2025-01-01", dateTo: "2025-06-30" });
  assert.deepEqual(halfRange(2025, 2), { dateFrom: "2025-07-01", dateTo: "2025-12-31" });
});

test("fyRange: full calendar year", () => {
  assert.deepEqual(fyRange(2026), { dateFrom: "2026-01-01", dateTo: "2026-12-31" });
});

test("resolveStatementScopeKind: explicit scope wins, else backward-compatible", () => {
  assert.equal(resolveStatementScopeKind({ scope: "quarter" }), "quarter");
  assert.equal(resolveStatementScopeKind({ scope: "fy" }), "fy");
  assert.equal(resolveStatementScopeKind({ periodId: "p1" }), "month");
  assert.equal(resolveStatementScopeKind({ from: "2024-01-01" }), "custom");
  assert.equal(resolveStatementScopeKind({ to: "2024-01-01" }), "custom");
  assert.equal(resolveStatementScopeKind({}), "month");
  // Unknown scope value falls through to backward-compat logic.
  assert.equal(resolveStatementScopeKind({ scope: "bogus", periodId: "p1" }), "month");
});

test("defaultShowZero: FY defaults on, others off", () => {
  assert.equal(defaultShowZero("fy"), true);
  assert.equal(defaultShowZero("month"), false);
  assert.equal(defaultShowZero("quarter"), false);
  assert.equal(defaultShowZero("half"), false);
  assert.equal(defaultShowZero("custom"), false);
});

test("resolveShowZero: explicit 1/0 override scope default", () => {
  // FY defaults on, can be turned off.
  assert.equal(resolveShowZero("fy", undefined), true);
  assert.equal(resolveShowZero("fy", "0"), false);
  assert.equal(resolveShowZero("fy", "1"), true);
  // Month defaults off, can be turned on.
  assert.equal(resolveShowZero("month", undefined), false);
  assert.equal(resolveShowZero("month", "1"), true);
  assert.equal(resolveShowZero("month", "0"), false);
});

test("quarterOfMonth: maps months to quarters", () => {
  assert.equal(quarterOfMonth(1), 1);
  assert.equal(quarterOfMonth(3), 1);
  assert.equal(quarterOfMonth(4), 2);
  assert.equal(quarterOfMonth(9), 3);
  assert.equal(quarterOfMonth(12), 4);
});

test("parseQuarters: parses, dedupes, sorts, clamps", () => {
  assert.deepEqual(parseQuarters("Q1,Q2"), [1, 2]);
  assert.deepEqual(parseQuarters("1,3"), [1, 3]);
  assert.deepEqual(parseQuarters("Q3,Q1,Q3"), [1, 3]);
  assert.deepEqual(parseQuarters("Q5,Q0,Q2"), [2]); // out-of-range dropped
  assert.deepEqual(parseQuarters(""), []);
  assert.deepEqual(parseQuarters(undefined), []);
});

test("quartersDateRange: bounding range across selected quarters", () => {
  assert.deepEqual(quartersDateRange(2025, [1, 2]), { dateFrom: "2025-01-01", dateTo: "2025-06-30" });
  // non-contiguous Q1,Q3 -> Jan..Sep bounding range (caller filters Q2 out)
  assert.deepEqual(quartersDateRange(2025, [1, 3]), { dateFrom: "2025-01-01", dateTo: "2025-09-30" });
  assert.deepEqual(quartersDateRange(2026, [2]), { dateFrom: "2026-04-01", dateTo: "2026-06-30" });
  assert.equal(quartersDateRange(2025, []), null);
});

test("formatQuartersLabel: single, contiguous, non-contiguous", () => {
  assert.equal(formatQuartersLabel(2026, [2]), "Quarter: Q2 2026");
  assert.equal(formatQuartersLabel(2025, [1, 2]), "Quarters: Q1-Q2 2025");
  assert.equal(formatQuartersLabel(2025, [1, 2, 3]), "Quarters: Q1-Q3 2025");
  assert.equal(formatQuartersLabel(2025, [1, 3]), "Quarters: Q1, Q3 2025");
});

function cls(id: string, label: string, amount: number): CashFlowTreeNode {
  return { id, kind: "class", label, cashDirection: "in", amount, count: amount === 0 ? 0 : 1, children: [] };
}
function group(id: string, label: string, children: CashFlowTreeNode[]): CashFlowTreeNode {
  return {
    id, kind: "group", label, cashDirection: "neutral",
    amount: children.reduce((s, c) => s + c.amount, 0),
    count: children.reduce((s, c) => s + c.count, 0),
    children,
  };
}

test("pruneZeroRows: drops zero leaves and fully-zero containers", () => {
  const statement: CashFlowStatement = {
    roots: [
      group("s1", "Operations", [
        group("g1", "Revenue", [cls("a", "Sales", 100), cls("b", "Refunds", 0)]),
        group("g2", "Empty", [cls("c", "Nothing", 0)]),
      ]),
    ],
    net: 100,
    includedCount: 1,
  };
  const pruned = pruneZeroRows(statement);
  const ops = pruned.roots[0];
  assert.equal(ops.children.length, 1); // "Empty" group removed
  assert.equal(ops.children[0].label, "Revenue");
  assert.equal(ops.children[0].children.length, 1); // zero "Refunds" leaf removed
  assert.equal(ops.children[0].children[0].label, "Sales");
});

test("pruneZeroRows: keeps a container whose signed sum is zero but has non-zero leaves", () => {
  const statement: CashFlowStatement = {
    roots: [
      group("s1", "Financing", [cls("in", "Borrowings", 500), cls("out", "Repayment", -500)]),
    ],
    net: 0,
    includedCount: 2,
  };
  const pruned = pruneZeroRows(statement);
  assert.equal(pruned.roots.length, 1); // section kept (sum 0 but real leaves)
  assert.equal(pruned.roots[0].children.length, 2);
});

test("pruneZeroRows: empty statement stays empty", () => {
  const pruned = pruneZeroRows({ roots: [], net: 0, includedCount: 0 });
  assert.deepEqual(pruned.roots, []);
});

test("aggregatePeriodBridge: opening from first month, fx summed; partial labels", () => {
  const agg = aggregatePeriodBridge([
    { year: 2026, month: 3, openingBalance: 30, fxFluctuations: -3 },
    { year: 2026, month: 1, openingBalance: 10, fxFluctuations: -1 },
    { year: 2026, month: 2, openingBalance: 20, fxFluctuations: -2 },
  ]);
  assert.equal(agg.opening, 10); // first chronological month (Jan)
  assert.equal(agg.fx, -6);
  assert.equal(agg.firstMonth, 1);
  assert.equal(agg.lastMonth, 3);
});

test("aggregatePeriodBridge: empty -> nulls and zero fx", () => {
  const agg = aggregatePeriodBridge([]);
  assert.equal(agg.opening, null);
  assert.equal(agg.fx, 0);
  assert.equal(agg.firstMonth, null);
  assert.equal(agg.lastMonth, null);
});
