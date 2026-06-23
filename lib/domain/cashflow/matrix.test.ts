import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCashFlowMatrix, type MatrixPeriodInput } from "./matrix.ts";
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

const PERIODS: MatrixPeriodInput[] = [
  { id: "p1", year: 2026, month: 1, label: "Jan 2026", openingBalance: 1000, fxFluctuations: -10, storedClosingBalance: null },
  { id: "p2", year: 2026, month: 2, label: "Feb 2026", openingBalance: null, fxFluctuations: 5, storedClosingBalance: null },
  { id: "p3", year: 2026, month: 3, label: "Mar 2026", openingBalance: null, fxFluctuations: 0, storedClosingBalance: 1234.56 },
];

const TXNS = new Map<string, CashFlowTxn[]>([
  ["p1", [
    txn({ id: "t1", classId: "land", amountGel: 500 }),
    txn({ id: "t2", classId: "sal", amountGel: 200 }),
    txn({ id: "t3", classId: "borrow", amountGel: 1000 }), // both -> +1000
  ]],
  ["p2", [
    txn({ id: "t4", classId: "land", amountGel: 800 }),
    txn({ id: "t5", classId: "borrow", amountGel: -300 }), // both -> -300 (repayment)
  ]],
  ["p3", [
    txn({ id: "t6", classId: "sal", amountGel: 100 }),
  ]],
]);

test("buildCashFlowMatrix: produces one cell per period plus a Total column for line items", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  assert.equal(m.periods.length, 3);
  // First row is the section header "Operations".
  const opsSection = m.rows.find((r) => r.kind === "section" && r.label === "Operations");
  assert.ok(opsSection);
  // Operations = land(+) + sal(-): Jan = 500 - 200 = 300, Feb = 800 - 0 = 800, Mar = 0 - 100 = -100. Total = 1000.
  assert.deepEqual(opsSection!.cells.map((c) => c.value), [300, 800, -100]);
  assert.equal(opsSection!.total.value, 1000);
});

test("buildCashFlowMatrix: 'Total ...' group renders as footer subtotal after children", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  // Within rows, "Salaries" (class child) must appear before "Total Expenses" (footer).
  const idxSalaries = m.rows.findIndex((r) => r.label === "Salaries");
  const idxTotalExpenses = m.rows.findIndex((r) => r.label === "Total Expenses" && r.isTotal);
  assert.ok(idxSalaries >= 0 && idxTotalExpenses > idxSalaries);
  // Total Expenses cells = -200, 0, -100, total = -300.
  const te = m.rows[idxTotalExpenses];
  assert.deepEqual(te.cells.map((c) => c.value), [-200, 0, -100]);
  assert.equal(te.total.value, -300);
  assert.equal(te.emphasis, true);
});

test("buildCashFlowMatrix: bidirectional 'both' class preserves sign in each column", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const borrow = m.rows.find((r) => r.label === "Borrowings");
  assert.ok(borrow);
  assert.equal(borrow!.direction, "both");
  // Jan = +1000, Feb = -300, Mar = 0; total = 700.
  assert.deepEqual(borrow!.cells.map((c) => c.value), [1000, -300, 0]);
  assert.equal(borrow!.total.value, 700);
});

test("buildCashFlowMatrix: bridge rows - opening, net, fx, closing", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const opening = m.rows.find((r) => r.kind === "bridge-opening")!;
  const net = m.rows.find((r) => r.kind === "bridge-net")!;
  const fx = m.rows.find((r) => r.kind === "bridge-fx")!;
  const closing = m.rows.find((r) => r.kind === "bridge-closing")!;

  // Opening row: per-period values verbatim; Total column is a dash (not summed).
  assert.deepEqual(opening.cells.map((c) => c.value), [1000, null, null]);
  assert.equal(opening.total.value, null);
  assert.equal(opening.total.text, "-");

  // Net cash change = section sums per period. Operations = 300/800/-100; Financing = 1000/-300/0.
  // -> 1300, 500, -100; total = 1700.
  assert.deepEqual(net.cells.map((c) => c.value), [1300, 500, -100]);
  assert.equal(net.total.value, 1700);

  // FX row: per-period verbatim, summed in Total.
  assert.deepEqual(fx.cells.map((c) => c.value), [-10, 5, 0]);
  assert.equal(fx.total.value, -5);

  // Closing per period: opening + net + fx when opening is known. Jan = 1000 + 1300 - 10 = 2290.
  // Feb: opening is null -> closing null. Mar: stored = 1234.56 wins.
  assert.deepEqual(closing.cells.map((c) => c.value), [2290, null, 1234.56]);
  // Total column = last visible period's closing (carry, not sum).
  assert.equal(closing.total.value, 1234.56);
});

test("buildCashFlowMatrix: empty periods -> no columns, no rows", () => {
  const m = buildCashFlowMatrix(NODES, [], new Map());
  assert.equal(m.periods.length, 0);
  assert.equal(m.rows.length, 0);
});

test("buildCashFlowMatrix: amounts render with accounting parentheses for negatives", () => {
  const m = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  const expensesTotal = m.rows.find((r) => r.label === "Total Expenses" && r.isTotal)!;
  // Jan cell = -200 -> "(200.00)"
  assert.equal(expensesTotal.cells[0].text, "(200.00)");
  assert.equal(expensesTotal.cells[0].negative, true);
  // Feb cell = 0 -> "0.00", not negative.
  assert.equal(expensesTotal.cells[1].text, "0.00");
  assert.equal(expensesTotal.cells[1].negative, false);
  // Total = -300 -> "(300.00)"
  assert.equal(expensesTotal.total.text, "(300.00)");
});

test("buildCashFlowMatrix: row order is deterministic across periods (uses one shared walk)", () => {
  const m1 = buildCashFlowMatrix(NODES, PERIODS, TXNS);
  // Re-run with empty txn map; the shape (keys, depths) must match.
  const empty = new Map([["p1", []], ["p2", []], ["p3", []]]);
  const m2 = buildCashFlowMatrix(NODES, PERIODS, empty);
  assert.deepEqual(m1.rows.map((r) => r.key), m2.rows.map((r) => r.key));
  assert.deepEqual(m1.rows.map((r) => r.depth), m2.rows.map((r) => r.depth));
  // And the empty matrix is genuinely empty for line items.
  const opsEmpty = m2.rows.find((r) => r.kind === "section" && r.label === "Operations")!;
  assert.deepEqual(opsEmpty.cells.map((c) => c.value), [0, 0, 0]);
  assert.equal(opsEmpty.total.value, 0);
});

test("buildCashFlowMatrix: prefers stored closing balance when present", () => {
  const periods: MatrixPeriodInput[] = [
    { id: "p", year: 2026, month: 5, label: "May 2026", openingBalance: 100, fxFluctuations: -50, storedClosingBalance: 999 },
  ];
  const m = buildCashFlowMatrix(NODES, periods, new Map([["p", [
    txn({ id: "x", classId: "land", amountGel: 500 }),
  ]]]));
  const closing = m.rows.find((r) => r.kind === "bridge-closing")!;
  // Computed would be 100 + 500 - 50 = 550, but stored 999 wins.
  assert.equal(closing.cells[0].value, 999);
});
