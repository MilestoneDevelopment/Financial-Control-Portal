import { test } from "node:test";
import assert from "node:assert/strict";
import { activeClassOptions } from "./classes.ts";
import type { CfNode } from "@/lib/domain/structure/tree";

function node(p: Partial<CfNode>): CfNode {
  return {
    id: "n",
    company_id: "c",
    structure_version_id: "v",
    parent_id: null,
    kind: "class",
    label: "Class",
    sort_order: 0,
    cash_direction: "in",
    is_active: true,
    dept: null,
    created_at: "2026-01-01",
    ...p,
  } as CfNode;
}

test("activeClassOptions: only active class nodes, mapped to options", () => {
  const opts = activeClassOptions([
    node({ id: "c1", kind: "class", label: "Land Plot Sales", is_active: true, cash_direction: "in" }),
    node({ id: "c2", kind: "class", label: "Salaries", is_active: true, cash_direction: "out" }),
    node({ id: "c3", kind: "class", label: "Old", is_active: false }), // inactive -> excluded
    node({ id: "s1", kind: "section", label: "Operating", is_active: true }), // not a class
    node({ id: "g1", kind: "group", label: "Revenue", is_active: true }), // not a class
  ]);
  assert.deepEqual(opts, [
    { id: "c1", label: "Land Plot Sales", cashDirection: "in" },
    { id: "c2", label: "Salaries", cashDirection: "out" },
  ]);
});

test("activeClassOptions: empty input -> empty", () => {
  assert.deepEqual(activeClassOptions([]), []);
});
