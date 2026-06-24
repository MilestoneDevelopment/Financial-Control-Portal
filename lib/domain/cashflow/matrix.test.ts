import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCashFlowMatrix,
  latestYearWindow,
  selectMatrixYears,
  buildAggregateMatrix,
  quarterColumns,
  latestMonthColumns,
  groupColumnYears,
  type MatrixPeriodInput,
} from "./matrix.ts";
import type { CashFlowNode, CashFlowTxn } from "./types.ts";

function node(
  p: Partial<CashFlowNode> & Pick<CashFlowNode, "id" | "kind" | "label" | "parentId">,
): CashFlowNode {
  return { sortOrder: 0, cashDirection: "neutral", isActive: true, ...p };
}

function txn(
  p: Partial<CashFlowTxn> & Pick<CashFlowTxn, "id" | "classId">,
): CashFlowTxn {
  return {
    status: "confirmed",
    source: "import",
    amountGel: 100,
    fxStatus: "not_required",
    ...p,
  };
}

// Section > Revenue (in) + Expenses (out) + Financing > Borrowings (both)
const NODES: CashFlowNode[] = [
  node({ id: "s1", kind: "section", label: "Operations", parentId: null, sortOrder: 0 }),
  node({ id: "rev", kind: "group", label: "Revenue", parentId: "s1", sortOrder: 0 }),
  node({ id: "land", kind: "class", label: "Land Plot Sales", parentId: "rev", cashDirection: "in" }),
  node({ id: "exp", kind: "group", label: "Total Expenses", parentId: "s1", sortOrder: 1 }),
  node({ id: "sal", kind: "class", label: "Salaries", parentId: "exp", cashDirection: "out" }),
  node({ id: "s2", kind: "section", label: "Financing", parentId: null, sortOrder: 1 }),
  node({ id: "borrow", kind: "class", label: "Borrowings", parentId: "s2", cashDirection: "both" }),
];

// Two years: 2025 (3 months) + 2026 (2 months).
const PERIODS: MatrixPeriodInput[] = [
  { id: "p25jan", year: 2025, month: 1, label: "Jan 2025", openingBalance: 1000, fxFluctuations: -10, storedClosingBalance: null },
  { id: "p25feb", year: 2025, month: 2, label: "Feb 2025", openingBalance: null, fxFluctuations: 5, storedClosingBalance: null },
  { id: "p25mar", year: 2025, month: 3, label: "Mar 2025", openingBalance: null, fxFluctuations: 0, storedClosingBalance: 1234.56 },
  { id: "p26jan", year: 2026, month: 1, label: "Jan 2026", openingBalance: 2000, fxFluctuations: -20, storedClosingBalance: null },
  { id: "p26feb", year: 2026, month: 2, label: "Feb 2026", openingBalance: null, fxFluctuations: 0, storedClosingBalance: 3000 },
];

const TXNS = new Map<string, CashFlowTxn[]>([
  ["p25jan", [
    txn({ id: "t1", classId: "land", amountGel: 500 }),
    txn({ id: "t2", classId: "sal", amountGel: 200 }),
    txn({ id: "t3", classId: "borrow", amountGel: 1000 }), // both -> +1000
  ]],
  ["p25feb", [
    txn({ id: "t4", classId: "land", amountGel: 800 }),
    txn({ id: "t5", classId: "borrow", amountGel: -300 }),
  ]],
  ["p25mar", [
    txn({ id: "t6", classId: "sal", amountGel: 100 }),
  ]],
  ["p26jan", [
    txn({ id: "t7", classId: "land", amountGel: 400 }),
  ]],
  ["p26feb", [
    txn({ id: "t8", classId: "sal", amountGel: 50 }),
    txn({ id: "t9", classId: "borrow", amountGel: 250 }),
  ]],
]);

test("buildCashFlowMatrix: groups months into year buckets in chronological order", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  assert.deepEqual(m.years.map((y) => y.year), [2025, 2026]);
  assert.deepEqual(m.years[0].months.map((mm) => mm.label), ["Jan", "Feb", "Mar"]);
  assert.deepEqual(m.years[1].months.map((mm) => mm.label), ["Jan", "Feb"]);
  // Full labels preserved for tooltips / accessibility.
  assert.equal(m.years[0].months[0].fullLabel, "Jan 2025");
});

test("buildCashFlowMatrix: line-item year subtotals + grand total sum monthly cells", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  // Operations section: land(+) + sal(-).
  // 2025: Jan 500-200=300, Feb 800-0=800, Mar 0-100=-100 -> year sum 1000.
  // 2026: Jan 400-0=400, Feb 0-50=-50 -> year sum 350. Grand total = 1350.
  const ops = m.rows.find((r) => r.kind === "section" && r.label === "Operations");
  assert.ok(ops);
  assert.deepEqual(ops!.byYear[0].months.map((c) => c.value), [300, 800, -100]);
  assert.equal(ops!.byYear[0].total.value, 1000);
  assert.deepEqual(ops!.byYear[1].months.map((c) => c.value), [400, -50]);
  assert.equal(ops!.byYear[1].total.value, 350);
  assert.equal(ops!.total.value, 1350);
});

test("buildCashFlowMatrix: 'Total ...' footer subtotal renders after children", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const idxSal = m.rows.findIndex((r) => r.label === "Salaries");
  const idxTotalExp = m.rows.findIndex((r) => r.label === "Total Expenses" && r.isTotal);
  assert.ok(idxSal >= 0 && idxTotalExp > idxSal);
  const te = m.rows[idxTotalExp];
  // Salaries is "out": Jan -200, Feb 0, Mar -100 (year sum -300); Jan26 0, Feb26 -50 (year sum -50).
  assert.deepEqual(te.byYear[0].months.map((c) => c.value), [-200, 0, -100]);
  assert.equal(te.byYear[0].total.value, -300);
  assert.equal(te.emphasis, true);
});

test("buildCashFlowMatrix: bidirectional 'both' class preserves sign in each column", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const borrow = m.rows.find((r) => r.label === "Borrowings");
  assert.ok(borrow);
  assert.equal(borrow!.direction, "both");
  assert.deepEqual(borrow!.byYear[0].months.map((c) => c.value), [1000, -300, 0]);
  assert.equal(borrow!.byYear[0].total.value, 700);
  assert.deepEqual(borrow!.byYear[1].months.map((c) => c.value), [0, 250]);
  assert.equal(borrow!.byYear[1].total.value, 250);
  assert.equal(borrow!.total.value, 950);
});

test("buildCashFlowMatrix: bridge-opening - first month of year; grand total dash", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const open = m.rows.find((r) => r.kind === "bridge-opening")!;
  assert.deepEqual(open.byYear[0].months.map((c) => c.value), [1000, null, null]);
  // Year total = first non-null opening of that year.
  assert.equal(open.byYear[0].total.value, 1000);
  assert.equal(open.byYear[1].total.value, 2000);
  // Grand total = dash (summing openings would mislead).
  assert.equal(open.total.value, null);
  assert.equal(open.total.text, "-");
});

test("buildCashFlowMatrix: bridge-net + bridge-fx - year sums + grand total sum", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const net = m.rows.find((r) => r.kind === "bridge-net")!;
  const fx = m.rows.find((r) => r.kind === "bridge-fx")!;
  // 2025 net: 1300, 500, -100 = 1700; 2026 net: 400, 200 = 600; grand 2300.
  assert.deepEqual(net.byYear[0].months.map((c) => c.value), [1300, 500, -100]);
  assert.equal(net.byYear[0].total.value, 1700);
  assert.deepEqual(net.byYear[1].months.map((c) => c.value), [400, 200]);
  assert.equal(net.byYear[1].total.value, 600);
  assert.equal(net.total.value, 2300);
  // 2025 fx: -10 + 5 + 0 = -5; 2026 fx: -20 + 0 = -20; grand -25.
  assert.equal(fx.byYear[0].total.value, -5);
  assert.equal(fx.byYear[1].total.value, -20);
  assert.equal(fx.total.value, -25);
});

test("buildCashFlowMatrix: bridge-closing - last month of year; grand = last visible", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const close = m.rows.find((r) => r.kind === "bridge-closing")!;
  // Jan 2025 closing = 1000 + 1300 - 10 = 2290. Feb 2025 opening null -> closing null.
  // Mar 2025: stored closing 1234.56 wins.
  assert.deepEqual(close.byYear[0].months.map((c) => c.value), [2290, null, 1234.56]);
  // Year total = last non-null closing of the year.
  assert.equal(close.byYear[0].total.value, 1234.56);
  // 2026: Jan 2026 closing = 2000 + 400 - 20 = 2380; Feb 2026 stored 3000 wins.
  assert.equal(close.byYear[1].total.value, 3000);
  // Grand total = last visible period's closing.
  assert.equal(close.total.value, 3000);
});

test("buildCashFlowMatrix: accounting parentheses for negatives", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const te = m.rows.find((r) => r.label === "Total Expenses" && r.isTotal)!;
  assert.equal(te.byYear[0].months[0].text, "(200.00)");
  assert.equal(te.byYear[0].months[0].negative, true);
  assert.equal(te.byYear[0].months[1].text, "0.00");
  assert.equal(te.byYear[0].months[1].negative, false);
  assert.equal(te.byYear[0].total.text, "(300.00)");
});

test("buildCashFlowMatrix: row shape is deterministic across periods", () => {
  const m1 = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const empty = new Map(PERIODS.map((p) => [p.id, []]));
  const m2 = buildCashFlowMatrix(NODES, PERIODS, empty);
  assert.deepEqual(m1.rows.map((r) => r.key), m2.rows.map((r) => r.key));
  assert.deepEqual(m1.rows.map((r) => r.depth), m2.rows.map((r) => r.depth));
});

test("buildCashFlowMatrix: empty periods -> no years, no rows", () => {
  const m = buildCashFlowMatrix(NODES, [], new Map());
  assert.equal(m.years.length, 0);
  assert.equal(m.rows.length, 0);
});

test("buildCashFlowMatrix: prefers stored closing balance over computed", () => {
  const periods: MatrixPeriodInput[] = [
    { id: "p", year: 2026, month: 5, label: "May 2026", openingBalance: 100, fxFluctuations: -50, storedClosingBalance: 999 },
  ];
  const m = buildCashFlowMatrix(NODES, periods, new Map([["p", [
    txn({ id: "x", classId: "land", amountGel: 500 }),
  ]]]));
  const closing = m.rows.find((r) => r.kind === "bridge-closing")!;
  // Computed would be 100 + 500 - 50 = 550, but stored 999 wins.
  assert.equal(closing.byYear[0].months[0].value, 999);
});

test("latestYearWindow: <= window size -> spans all available years", () => {
  assert.deepEqual(latestYearWindow([2023, 2024, 2025, 2026]), { from: 2023, to: 2026 });
  assert.deepEqual(latestYearWindow([2026, 2024, 2023, 2025]), { from: 2023, to: 2026 });
  assert.deepEqual(latestYearWindow([2026]), { from: 2026, to: 2026 });
});

test("latestYearWindow: > window size -> latest N years (older still accessible via spec)", () => {
  // 2022..2028 with default size 5 -> 2024..2028.
  assert.deepEqual(latestYearWindow([2022, 2023, 2024, 2025, 2026, 2027, 2028]), {
    from: 2024,
    to: 2028,
  });
});

test("latestYearWindow: explicit size + deduped input", () => {
  assert.deepEqual(latestYearWindow([2020, 2021, 2022, 2022, 2023], 3), {
    from: 2021,
    to: 2023,
  });
});

test("latestYearWindow: empty / invalid size -> null", () => {
  assert.equal(latestYearWindow([]), null);
  assert.equal(latestYearWindow([2024], 0), null);
});

test("selectMatrixYears: window inclusive on both ends", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const within = selectMatrixYears(m, {
    window: { from: 2025, to: 2026 },
    focusedYear: null,
  });
  assert.deepEqual(within.map((y) => y.year), [2025, 2026]);
});

test("selectMatrixYears: tighter window hides older years (still on model)", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  assert.deepEqual(m.years.map((y) => y.year), [2025, 2026]); // unchanged
  const onlyLatest = selectMatrixYears(m, {
    window: { from: 2026, to: 2026 },
    focusedYear: null,
  });
  assert.deepEqual(onlyLatest.map((y) => y.year), [2026]);
});

test("selectMatrixYears: focusedYear wins over window", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  // Window allows both, but focus pins to 2025 only.
  const only2025 = selectMatrixYears(m, {
    window: { from: 2025, to: 2026 },
    focusedYear: 2025,
  });
  assert.deepEqual(only2025.map((y) => y.year), [2025]);
  // Focus on a year not in the window still works (older years remain accessible).
  const only2025again = selectMatrixYears(m, {
    window: { from: 2026, to: 2026 },
    focusedYear: 2025,
  });
  assert.deepEqual(only2025again.map((y) => y.year), [2025]);
});

test("buildCashFlowMatrix: year-level periods (month=null) are excluded", () => {
  const periods: MatrixPeriodInput[] = [
    ...PERIODS,
    { id: "fy25", year: 2025, month: null, label: "FY2025", openingBalance: 0, fxFluctuations: 0, storedClosingBalance: null },
  ];
  const txns = new Map(TXNS);
  txns.set("fy25", []);
  const m = buildCashFlowMatrix(NODES, periods, txns);
  // Only monthly periods are bucketed; FY2025 is dropped.
  assert.equal(m.years[0].months.length, 3);
  assert.equal(m.years[1].months.length, 2);
});

/* ---- Phase 5E: flat aggregation matrix ---- */

test("quarterColumns: groups months by (year, quarter) chronologically", () => {
  const cols = quarterColumns(PERIODS);
  assert.deepEqual(cols.map((c) => c.key), ["2025-Q1", "2026-Q1"]);
  assert.deepEqual(cols.map((c) => c.label), ["Q1 2025", "Q1 2026"]);
  assert.deepEqual(cols.map((c) => c.periods.length), [3, 2]); // Jan-Mar, Jan-Feb
});

test("latestMonthColumns: one column per month, latest N chronological", () => {
  const all = latestMonthColumns(PERIODS, 12);
  assert.deepEqual(all.map((c) => c.label), ["Jan 2025", "Feb 2025", "Mar 2025", "Jan 2026", "Feb 2026"]);
  const last2 = latestMonthColumns(PERIODS, 2);
  assert.deepEqual(last2.map((c) => c.label), ["Jan 2026", "Feb 2026"]);
  assert.equal(last2[0].periods.length, 1);
});

test("buildAggregateMatrix: quarter columns sum months; Total sums columns", () => {
  const m = buildAggregateMatrix(NODES, quarterColumns(PERIODS), TXNS);
  assert.deepEqual(m.columns.map((c) => c.label), ["Q1 2025", "Q1 2026"]);
  // Operations = land(+) + sal(-): Q1 2025 = 1300-300 = 1000; Q1 2026 = 400-50 = 350.
  const ops = m.rows.find((r) => r.kind === "section" && r.label === "Operations")!;
  assert.deepEqual(ops.cells.map((c) => c.value), [1000, 350]);
  assert.equal(ops.total.value, 1350);
  // "Total Expenses" footer subtotal: -300 / -50, total -350.
  const te = m.rows.find((r) => r.label === "Total Expenses" && r.isTotal)!;
  assert.deepEqual(te.cells.map((c) => c.value), [-300, -50]);
  assert.equal(te.total.value, -350);
  // Bidirectional Borrowings preserved: 700 / 250, total 950.
  const borrow = m.rows.find((r) => r.label === "Borrowings")!;
  assert.deepEqual(borrow.cells.map((c) => c.value), [700, 250]);
  assert.equal(borrow.total.value, 950);
});

test("buildAggregateMatrix: quarter bridge rows (opening first, closing last, net/fx sum)", () => {
  const m = buildAggregateMatrix(NODES, quarterColumns(PERIODS), TXNS);
  const opening = m.rows.find((r) => r.kind === "bridge-opening")!;
  const net = m.rows.find((r) => r.kind === "bridge-net")!;
  const fx = m.rows.find((r) => r.kind === "bridge-fx")!;
  const closing = m.rows.find((r) => r.kind === "bridge-closing")!;
  // Opening = first month of each quarter; Total = "-".
  assert.deepEqual(opening.cells.map((c) => c.value), [1000, 2000]);
  assert.equal(opening.total.value, null);
  assert.equal(opening.total.text, "-");
  // Net = Operations + Financing per quarter: 1700 / 600; total 2300.
  assert.deepEqual(net.cells.map((c) => c.value), [1700, 600]);
  assert.equal(net.total.value, 2300);
  // FX summed: -5 / -20; total -25.
  assert.deepEqual(fx.cells.map((c) => c.value), [-5, -20]);
  assert.equal(fx.total.value, -25);
  // Closing = opening + net + fx: 2695 / 2580; Total = last column closing 2580.
  assert.deepEqual(closing.cells.map((c) => c.value), [2695, 2580]);
  assert.equal(closing.total.value, 2580);
});

test("buildAggregateMatrix: partial quarter uses only available months", () => {
  // Only 2026 Jan+Feb exist for Q1 2026 (no March) -> one partial quarter column.
  const partial = PERIODS.filter((p) => p.year === 2026);
  const cols = quarterColumns(partial);
  assert.equal(cols.length, 1);
  assert.equal(cols[0].label, "Q1 2026");
  const m = buildAggregateMatrix(NODES, cols, TXNS);
  const closing = m.rows.find((r) => r.kind === "bridge-closing")!;
  // opening 2000 + net 600 + fx -20 = 2580.
  assert.equal(closing.cells[0].value, 2580);
  assert.equal(closing.total.value, 2580);
});

test("buildAggregateMatrix: month columns use single-period values", () => {
  const m = buildAggregateMatrix(NODES, latestMonthColumns(PERIODS, 12), TXNS);
  assert.equal(m.columns.length, 5);
  const net = m.rows.find((r) => r.kind === "bridge-net")!;
  // Per-month net: Jan25 1300, Feb25 500, Mar25 -100, Jan26 400, Feb26 200.
  assert.deepEqual(net.cells.map((c) => c.value), [1300, 500, -100, 400, 200]);
  assert.equal(net.total.value, 2300);
  const closing = m.rows.find((r) => r.kind === "bridge-closing")!;
  // Total closing = last month's closing.
  assert.equal(closing.total.value, closing.cells[closing.cells.length - 1].value);
});

test("buildAggregateMatrix: empty columns -> no columns, no rows", () => {
  const m = buildAggregateMatrix(NODES, [], TXNS);
  assert.deepEqual(m.columns, []);
  assert.deepEqual(m.rows, []);
});

test("columns carry year + short sub-labels for the grouped header", () => {
  const q = buildAggregateMatrix(NODES, quarterColumns(PERIODS), TXNS);
  assert.deepEqual(q.columns.map((c) => c.year), [2025, 2026]);
  assert.deepEqual(q.columns.map((c) => c.short), ["Q1", "Q1"]);
  const m = buildAggregateMatrix(NODES, latestMonthColumns(PERIODS, 12), TXNS);
  assert.deepEqual(m.columns.map((c) => c.short), ["Jan", "Feb", "Mar", "Jan", "Feb"]);
  assert.deepEqual(m.columns.map((c) => c.year), [2025, 2025, 2025, 2026, 2026]);
});

test("groupColumnYears: contiguous same-year runs with span + startIndex", () => {
  const cols = [
    { year: 2025 }, { year: 2025 }, { year: 2025 }, { year: 2026 }, { year: 2026 },
  ];
  assert.deepEqual(groupColumnYears(cols), [
    { year: 2025, span: 3, startIndex: 0 },
    { year: 2026, span: 2, startIndex: 3 },
  ]);
  assert.deepEqual(groupColumnYears([]), []);
});

/* ---- Phase 5E: zero-line pruning ---- */

// Mar 2025 has only a Salaries (out) txn -> land/borrow zero that month.
const MAR_ONLY = PERIODS.filter((p) => p.id === "p25mar");

test("buildAggregateMatrix: hideZero drops all-zero rows, keeps nonzero parents + bridge", () => {
  const m = buildAggregateMatrix(NODES, latestMonthColumns(MAR_ONLY, 12), TXNS, true);
  const labels = m.rows.map((r) => r.label);
  // Kept: section with activity, its footer subtotal, the nonzero leaf.
  assert.ok(labels.includes("Operations"));
  assert.ok(labels.includes("Salaries"));
  assert.ok(labels.includes("Total Expenses"));
  // Dropped: zero leaves and their now-empty containers.
  assert.ok(!labels.includes("Land Plot Sales"));
  assert.ok(!labels.includes("Revenue"));
  assert.ok(!labels.includes("Borrowings"));
  assert.ok(!labels.includes("Financing"));
  // Bridge rows always preserved.
  assert.ok(m.rows.some((r) => r.kind === "bridge-opening"));
  assert.ok(m.rows.some((r) => r.kind === "bridge-closing"));
});

test("buildAggregateMatrix: hideZero off keeps the full row set", () => {
  const full = buildAggregateMatrix(NODES, latestMonthColumns(MAR_ONLY, 12), TXNS, false);
  const labels = full.rows.map((r) => r.label);
  assert.ok(labels.includes("Land Plot Sales"));
  assert.ok(labels.includes("Borrowings"));
  assert.ok(labels.includes("Financing"));
});

test("buildCashFlowMatrix: hideZero prunes the year model the same way", () => {
  const y = buildCashFlowMatrix(NODES, MAR_ONLY, TXNS, true);
  const labels = y.rows.map((r) => r.label);
  assert.ok(labels.includes("Operations"));
  assert.ok(labels.includes("Salaries"));
  assert.ok(!labels.includes("Land Plot Sales"));
  assert.ok(!labels.includes("Financing"));
  assert.ok(y.rows.some((r) => r.kind === "bridge-net"));
  // hideZero off restores the full set.
  const full = buildCashFlowMatrix(NODES, MAR_ONLY, TXNS, false);
  assert.ok(full.rows.some((r) => r.label === "Land Plot Sales"));
});
