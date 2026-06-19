import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCashFlowTree,
  rollupCashFlow,
  computeNetCashFlow,
  computeClosingBalance,
  signedAmount,
  isEligible,
} from "./generate.ts";
import type { CashFlowNode, CashFlowTxn } from "./types.ts";

function node(p: Partial<CashFlowNode> & Pick<CashFlowNode, "id" | "kind" | "label" | "parentId">): CashFlowNode {
  return {
    sortOrder: 0,
    cashDirection: "neutral",
    isActive: true,
    ...p,
  };
}

function txn(p: Partial<CashFlowTxn> & Pick<CashFlowTxn, "id" | "classId">): CashFlowTxn {
  return {
    status: "confirmed",
    source: "rule",
    amountGel: 100,
    fxStatus: "not_required",
    ...p,
  };
}

// Mirrors the real Tsavkisi Heights structure: Operating -> Revenue/Expenses.
const NODES: CashFlowNode[] = [
  node({ id: "s1", kind: "section", label: "Operating Cash Flow", parentId: null, sortOrder: 0 }),
  node({ id: "g1", kind: "group", label: "Revenue", parentId: "s1", sortOrder: 0 }),
  node({ id: "g2", kind: "group", label: "Expenses", parentId: "s1", sortOrder: 1 }),
  node({ id: "land", kind: "class", label: "Land Plot Sales", parentId: "g1", sortOrder: 0, cashDirection: "in" }),
  node({ id: "sal", kind: "class", label: "Salaries", parentId: "g2", sortOrder: 0, cashDirection: "out" }),
];

test("rollupCashFlow: class-level aggregation of eligible signed amounts", () => {
  const agg = rollupCashFlow(NODES, [
    txn({ id: "t1", classId: "land", source: "manual", amountGel: 1250.5 }),
    txn({ id: "t2", classId: "land", amountGel: 500 }),
    txn({ id: "t3", classId: "land", amountGel: 500 }),
    txn({ id: "t4", classId: "land", amountGel: 400 }),
    txn({ id: "t5", classId: "sal", amountGel: 800 }),
  ]);
  assert.equal(agg.get("land")?.amount, 2650.5);
  assert.equal(agg.get("land")?.count, 4);
  // Outflow class is negated.
  assert.equal(agg.get("sal")?.amount, -800);
  assert.equal(agg.get("sal")?.count, 1);
});

test("buildCashFlowTree: group/section rollup preserves hierarchy + order", () => {
  const st = buildCashFlowTree(NODES, [
    txn({ id: "t1", classId: "land", amountGel: 1000 }),
    txn({ id: "t2", classId: "sal", amountGel: 800 }),
  ]);
  assert.equal(st.sections.length, 1);
  const sec = st.sections[0];
  assert.equal(sec.label, "Operating Cash Flow");
  // Group order follows sort_order: Revenue (0) before Expenses (1).
  assert.deepEqual(sec.groups.map((g) => g.label), ["Revenue", "Expenses"]);
  assert.equal(sec.groups[0].amount, 1000); // Revenue
  assert.equal(sec.groups[1].amount, -800); // Expenses (out)
  assert.equal(sec.amount, 200); // section = 1000 - 800
  assert.equal(st.net, 200);
  assert.equal(st.includedCount, 2);
});

test("buildCashFlowTree: orders classes within a group by sortOrder", () => {
  const nodes: CashFlowNode[] = [
    node({ id: "s", kind: "section", label: "Op", parentId: null }),
    node({ id: "g", kind: "group", label: "Rev", parentId: "s" }),
    node({ id: "c2", kind: "class", label: "Second", parentId: "g", sortOrder: 1, cashDirection: "in" }),
    node({ id: "c1", kind: "class", label: "First", parentId: "g", sortOrder: 0, cashDirection: "in" }),
  ];
  const st = buildCashFlowTree(nodes, []);
  assert.deepEqual(st.sections[0].groups[0].classes.map((c) => c.label), ["First", "Second"]);
});

test("signedAmount: in adds, out subtracts, sign of the amount is preserved", () => {
  assert.equal(signedAmount(500, "in"), 500);
  assert.equal(signedAmount(500, "out"), -500);
  // A refund (negative amount) on an inflow class reduces the inflow.
  assert.equal(signedAmount(-200, "in"), -200);
  // A refund of an expense (negative amount) on an outflow class adds cash back.
  assert.equal(signedAmount(-200, "out"), 200);
});

test("isEligible: only confirmed + classified + fx-ok + directional rows count", () => {
  assert.equal(isEligible(txn({ id: "a", classId: "land" }), "in"), true);
  assert.equal(isEligible(txn({ id: "b", classId: null, status: "unclassified", source: null }), null), false);
  assert.equal(isEligible(txn({ id: "c", classId: "land", status: "suggested" }), "in"), false);
  assert.equal(isEligible(txn({ id: "d", classId: "land", fxStatus: "pending" }), "in"), false);
  assert.equal(isEligible(txn({ id: "e", classId: "land", amountGel: null }), "in"), false);
  // Confirmed + classified but the class has no direction -> not on a statement.
  assert.equal(isEligible(txn({ id: "f", classId: "x" }), "neutral"), false);
});

test("computeNetCashFlow: sums section totals", () => {
  const st = buildCashFlowTree(NODES, [
    txn({ id: "t1", classId: "land", amountGel: 1000 }),
    txn({ id: "t2", classId: "sal", amountGel: 250 }),
  ]);
  assert.equal(computeNetCashFlow(st.sections), 750);
});

test("computeClosingBalance: opening + net = closing identity", () => {
  assert.equal(computeClosingBalance(1000, 750), 1750);
  assert.equal(computeClosingBalance(0, -500), -500);
  // No opening balance -> null (never invented).
  assert.equal(computeClosingBalance(null, 750), null);
});

test("empty structure / missing class: no rows, zero net, nothing throws", () => {
  assert.deepEqual(buildCashFlowTree([], []), { sections: [], net: 0, includedCount: 0 });
  // Transaction points at a class id that is not in the structure -> ignored here
  // (coverage still counts it; see coverage tests).
  const st = buildCashFlowTree(NODES, [txn({ id: "t", classId: "ghost" })]);
  assert.equal(st.net, 0);
  assert.equal(st.includedCount, 0);
});

test("inactive nodes are excluded from the generated structure", () => {
  const nodes = NODES.map((n) => (n.id === "g2" ? { ...n, isActive: false } : n));
  const st = buildCashFlowTree(nodes, [txn({ id: "t", classId: "sal", amountGel: 800 })]);
  // Expenses group is inactive -> not rendered, and its class is not rolled up.
  assert.deepEqual(st.sections[0].groups.map((g) => g.label), ["Revenue"]);
  assert.equal(st.net, 0);
});
