import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCashFlowRows } from "./format.ts";
import { buildCashFlowTree } from "./generate.ts";
import type { CashFlowNode, CashFlowTxn, CashFlowStatement } from "./types.ts";

function node(p: Partial<CashFlowNode> & Pick<CashFlowNode, "id" | "kind" | "label" | "parentId">): CashFlowNode {
  return { sortOrder: 0, cashDirection: "neutral", isActive: true, ...p };
}
function txn(p: Partial<CashFlowTxn> & Pick<CashFlowTxn, "id" | "classId">): CashFlowTxn {
  return { status: "confirmed", source: "rule", amountGel: 100, fxStatus: "not_required", ...p };
}

const NODES: CashFlowNode[] = [
  node({ id: "s1", kind: "section", label: "Operating Cash Flow", parentId: null, sortOrder: 0 }),
  node({ id: "g1", kind: "group", label: "Revenue", parentId: "s1", sortOrder: 0 }),
  node({ id: "g2", kind: "group", label: "Expenses", parentId: "s1", sortOrder: 1 }),
  node({ id: "land", kind: "class", label: "Land Plot Sales", parentId: "g1", sortOrder: 0, cashDirection: "in" }),
  node({ id: "sal", kind: "class", label: "Salaries", parentId: "g2", sortOrder: 0, cashDirection: "out" }),
];

test("formatCashFlowRows: flattens to ordered rows with depth + emphasis", () => {
  const st = buildCashFlowTree(NODES, [
    txn({ id: "t1", classId: "land", amountGel: 1000 }),
    txn({ id: "t2", classId: "sal", amountGel: 800 }),
  ]);
  const rows = formatCashFlowRows(st);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.depth, r.label]),
    [
      ["section", 0, "Operating Cash Flow"],
      ["group", 1, "Revenue"],
      ["class", 2, "Land Plot Sales"],
      ["group", 1, "Expenses"],
      ["class", 2, "Salaries"],
    ],
  );
  assert.equal(rows[0].emphasis, true); // section
  assert.equal(rows[1].emphasis, false); // group
});

test("formatCashFlowRows: negatives use accounting parentheses, positives plain", () => {
  const st = buildCashFlowTree(NODES, [
    txn({ id: "t1", classId: "land", amountGel: 1250.5 }),
    txn({ id: "t2", classId: "sal", amountGel: 800 }),
  ]);
  const rows = formatCashFlowRows(st);
  const salary = rows.find((r) => r.label === "Salaries");
  const land = rows.find((r) => r.label === "Land Plot Sales");
  assert.equal(land?.amountText, "1,250.50");
  assert.equal(salary?.amountText, "(800.00)"); // outflow shown in parentheses
  assert.equal(land?.direction, "in");
  assert.equal(salary?.direction, "out");
});

test("formatCashFlowRows: flags a class with no cash direction", () => {
  const nodes: CashFlowNode[] = [
    node({ id: "s", kind: "section", label: "Op", parentId: null }),
    node({ id: "g", kind: "group", label: "G", parentId: "s" }),
    node({ id: "c", kind: "class", label: "No Direction", parentId: "g", cashDirection: "neutral" }),
  ];
  const st = buildCashFlowTree(nodes, []);
  const cls = formatCashFlowRows(st).find((r) => r.kind === "class");
  assert.equal(cls?.noDirection, true);
});

test("formatCashFlowRows: empty statement -> no rows", () => {
  const empty: CashFlowStatement = { sections: [], net: 0, includedCount: 0 };
  assert.deepEqual(formatCashFlowRows(empty), []);
});
