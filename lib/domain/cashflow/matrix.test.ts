import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCashFlowMatrix,
  latestYearWindow,
  selectMatrixYears,
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
