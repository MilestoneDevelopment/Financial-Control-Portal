import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTree, validateStructure, countNodes, type CfNode } from "./tree.ts";

function node(partial: Partial<CfNode> & Pick<CfNode, "id" | "kind" | "label" | "parent_id">): CfNode {
  return {
    company_id: "co",
    structure_version_id: "v1",
    sort_order: 0,
    cash_direction: "neutral",
    is_active: true,
    dept: null,
    created_at: "",
    ...partial,
  } as CfNode;
}

const flat: CfNode[] = [
  node({ id: "s1", kind: "section", label: "Operating", parent_id: null, sort_order: 0 }),
  node({ id: "g1", kind: "group", label: "Revenue", parent_id: "s1", sort_order: 0 }),
  node({ id: "c2", kind: "class", label: "Service Revenue", parent_id: "g1", sort_order: 1, cash_direction: "in" }),
  node({ id: "c1", kind: "class", label: "Sales Proceeds", parent_id: "g1", sort_order: 0, cash_direction: "in" }),
  node({ id: "s2", kind: "section", label: "Investing", parent_id: null, sort_order: 1 }),
];

test("buildTree: nests sections/groups/classes and sorts by sort_order", () => {
  const tree = buildTree(flat);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].label, "Operating");
  assert.equal(tree[0].children[0].children.map((c) => c.label).join(","), "Sales Proceeds,Service Revenue");
});

test("countNodes: tallies sections/groups/classes/active", () => {
  const c = countNodes(buildTree(flat));
  assert.deepEqual(c, { sections: 2, groups: 1, classes: 2, active: 2, inactive: 0 });
});

test("validateStructure: flags empty section, neutral class, duplicates", () => {
  const tree = buildTree([
    node({ id: "s1", kind: "section", label: "Operating", parent_id: null }),
    node({ id: "g1", kind: "group", label: "Revenue", parent_id: "s1" }),
    node({ id: "c1", kind: "class", label: "Dup", parent_id: "g1", cash_direction: "neutral" }),
    node({ id: "c2", kind: "class", label: "Dup", parent_id: "g1", cash_direction: "in" }),
    node({ id: "s2", kind: "section", label: "Empty", parent_id: null }),
  ]);
  const issues = validateStructure(tree);
  assert.ok(issues.some((i) => i.text.includes("no groups") && i.text.includes("Empty")));
  assert.ok(issues.some((i) => i.text.includes("no Cash In / Cash Out")));
  assert.ok(issues.some((i) => i.severity === "err" && i.text.includes("Duplicate")));
});
