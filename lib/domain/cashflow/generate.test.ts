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

const round2 = (n: number) => Math.round(n * 100) / 100;

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
  assert.equal(st.roots.length, 1);
  const sec = st.roots[0];
  assert.equal(sec.label, "Operating Cash Flow");
  // Group order follows sort_order: Revenue (0) before Expenses (1).
  assert.deepEqual(sec.children.map((g) => g.label), ["Revenue", "Expenses"]);
  assert.equal(sec.children[0].amount, 1000); // Revenue
  assert.equal(sec.children[1].amount, -800); // Expenses (out)
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
  assert.deepEqual(st.roots[0].children[0].children.map((c) => c.label), ["First", "Second"]);
});

test("buildCashFlowTree: arbitrary depth - container sums descendant leaves", () => {
  // Section > Outflows > Total Marketing > Online > leaves  (CF_Actual-style depth)
  const nodes: CashFlowNode[] = [
    node({ id: "s", kind: "section", label: "Cash flows from operations:", parentId: null, sortOrder: 0 }),
    node({ id: "out", kind: "group", label: "Outflows", parentId: "s", sortOrder: 0 }),
    node({ id: "tmkt", kind: "group", label: "Total Marketing", parentId: "out", sortOrder: 0 }),
    node({ id: "online", kind: "group", label: "Online/Digital channels", parentId: "tmkt", sortOrder: 0 }),
    node({ id: "web", kind: "class", label: "Project Webpage ", parentId: "online", sortOrder: 0, cashDirection: "out" }),
    node({ id: "seo", kind: "class", label: "SEO Optimisation", parentId: "online", sortOrder: 1, cashDirection: "out" }),
  ];
  const st = buildCashFlowTree(nodes, [
    txn({ id: "t1", classId: "web", amountGel: 300 }),
    txn({ id: "t2", classId: "seo", amountGel: 200 }),
  ]);
  const sec = st.roots[0];
  const out = sec.children[0];
  const tmkt = out.children[0];
  const online = tmkt.children[0];
  assert.equal(online.children.map((c) => c.label).join(","), "Project Webpage ,SEO Optimisation"); // exact labels incl. trailing space
  assert.equal(online.amount, -500); // both outflow -> negative
  assert.equal(tmkt.amount, -500); // total marketing rolls up the nested leaves
  assert.equal(out.amount, -500);
  assert.equal(sec.amount, -500);
  assert.equal(st.net, -500);
  assert.equal(st.includedCount, 2);
});

test("signedAmount: in adds, out subtracts, sign of the amount is preserved", () => {
  assert.equal(signedAmount(500, "in"), 500);
  assert.equal(signedAmount(500, "out"), -500);
  // A refund (negative amount) on an inflow class reduces the inflow.
  assert.equal(signedAmount(-200, "in"), -200);
  // A refund of an expense (negative amount) on an outflow class adds cash back.
  assert.equal(signedAmount(-200, "out"), 200);
  // 'both' is bidirectional: it preserves the transaction's own sign.
  assert.equal(signedAmount(500, "both"), 500);
  assert.equal(signedAmount(-200, "both"), -200);
});

test("bidirectional 'both' class: included, sign preserved, rolls into totals", () => {
  const nodes: CashFlowNode[] = [
    node({ id: "s", kind: "section", label: "Cash flows from financing activities", parentId: null, sortOrder: 0 }),
    node({ id: "t", kind: "group", label: "Total Cash flows from financing activities", parentId: "s", sortOrder: 0 }),
    node({ id: "cap", kind: "class", label: "Capital contributions", parentId: "t", sortOrder: 0, cashDirection: "both" }),
  ];
  // One equity inflow (+1000) and one return of capital (-300) on the SAME line.
  const st = buildCashFlowTree(nodes, [
    txn({ id: "a", classId: "cap", amountGel: 1000 }),
    txn({ id: "b", classId: "cap", amountGel: -300 }),
  ]);
  const cap = st.roots[0].children[0].children[0];
  assert.equal(cap.amount, 700); // 1000 + (-300), signs preserved
  assert.equal(cap.count, 2);
  assert.equal(st.net, 700); // rolls up through the financing total + section
});

test("isEligible: only confirmed + classified + fx-ok + directional rows count", () => {
  assert.equal(isEligible(txn({ id: "a", classId: "land" }), "in"), true);
  assert.equal(isEligible(txn({ id: "b", classId: null, status: "unclassified", source: null }), null), false);
  assert.equal(isEligible(txn({ id: "c", classId: "land", status: "suggested" }), "in"), false);
  assert.equal(isEligible(txn({ id: "d", classId: "land", fxStatus: "pending" }), "in"), false);
  assert.equal(isEligible(txn({ id: "e", classId: "land", amountGel: null }), "in"), false);
  // Confirmed + classified but the class has no direction -> not on a statement.
  assert.equal(isEligible(txn({ id: "f", classId: "x" }), "neutral"), false);
  // A bidirectional 'both' class is eligible.
  assert.equal(isEligible(txn({ id: "g", classId: "cap" }), "both"), true);
  // Imported summary actuals (source 'import') are eligible like manual/rule.
  assert.equal(isEligible(txn({ id: "h", classId: "land", source: "import" }), "in"), true);
});

test("computeNetCashFlow: sums section totals", () => {
  const st = buildCashFlowTree(NODES, [
    txn({ id: "t1", classId: "land", amountGel: 1000 }),
    txn({ id: "t2", classId: "sal", amountGel: 250 }),
  ]);
  assert.equal(computeNetCashFlow(st.roots), 750);
});

test("computeClosingBalance: opening + net + fx = closing identity", () => {
  assert.equal(computeClosingBalance(1000, 750), 1750); // fx defaults to 0
  assert.equal(computeClosingBalance(0, -500), -500);
  // FX fluctuations included: opening + net + fx.
  assert.equal(computeClosingBalance(1000, 750, -250), 1500);
  // Full-history reconciliation (rounded to 2dp to absorb float noise).
  assert.equal(round2(computeClosingBalance(0, 189565.58, -25075.41) as number), 164490.17);
  // No opening balance -> null (never invented), even with fx.
  assert.equal(computeClosingBalance(null, 750, -10), null);
});

test("empty structure / missing class: no rows, zero net, nothing throws", () => {
  assert.deepEqual(buildCashFlowTree([], []), { roots: [], net: 0, includedCount: 0 });
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
  assert.deepEqual(st.roots[0].children.map((g) => g.label), ["Revenue"]);
  assert.equal(st.net, 0);
});
