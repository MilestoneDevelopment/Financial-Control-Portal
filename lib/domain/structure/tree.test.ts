import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTree,
  validateStructure,
  countNodes,
  buildNodeTree,
  countTree,
  validateTree,
  type CfNode,
} from "./tree.ts";

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

// Recursive helpers (any-depth) - CF_Actual nests deeper than 3 levels.
const deep: CfNode[] = [
  node({ id: "s", kind: "section", label: "Cash flows from operations:", parent_id: null, sort_order: 0 }),
  node({ id: "tt", kind: "group", label: "Total Technical", parent_id: "s", sort_order: 1 }),
  node({ id: "tech1", kind: "class", label: "Geological study", parent_id: "tt", sort_order: 0, cash_direction: "out" }),
  node({ id: "capex", kind: "group", label: "CAPEX", parent_id: "tt", sort_order: 2 }),
  node({ id: "cube", kind: "group", label: "Cube Construction", parent_id: "capex", sort_order: 0 }),
  node({ id: "road", kind: "class", label: "Road construction", parent_id: "cube", sort_order: 0, cash_direction: "out" }),
  node({ id: "cap", kind: "class", label: "Capital contributions", parent_id: "s", sort_order: 3, cash_direction: "both" }),
];

test("buildNodeTree: nests to arbitrary depth and sorts each level", () => {
  const tree = buildNodeTree(deep);
  assert.equal(tree.length, 1);
  const s = tree[0];
  // Total Technical (sort 1) before Capital contributions (sort 3)
  assert.deepEqual(s.children.map((c) => c.label), ["Total Technical", "Capital contributions"]);
  const tt = s.children[0];
  // CAPEX is a deep container with its own subgroup + leaf (4 levels under section)
  const capex = tt.children.find((c) => c.label === "CAPEX")!;
  assert.equal(capex.children[0].label, "Cube Construction");
  assert.equal(capex.children[0].children[0].label, "Road construction");
});

test("countTree: counts all kinds across every depth", () => {
  const c = countTree(buildNodeTree(deep));
  // sections 1; groups Total Technical/CAPEX/Cube Construction = 3;
  // classes Geological study/Road construction/Capital contributions = 3 (all active)
  assert.deepEqual(c, { sections: 1, groups: 3, classes: 3, active: 3, inactive: 0 });
});

test("validateTree: no false 'empty' warnings for nested containers; flags neutral only", () => {
  const issues = validateTree(buildNodeTree(deep));
  // No container is empty here, and 'both'/'out' are directed -> no warnings.
  assert.equal(issues.length, 0);
  // A neutral class is flagged; 'both' is not.
  const withNeutral = validateTree(
    buildNodeTree([
      node({ id: "s", kind: "section", label: "S", parent_id: null }),
      node({ id: "n", kind: "class", label: "Undirected", parent_id: "s", cash_direction: "neutral" }),
    ]),
  );
  assert.ok(withNeutral.some((i) => i.text.includes("no Cash In / Out / Both")));
});
