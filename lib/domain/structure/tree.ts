/**
 * Pure cash-flow structure tree + validation logic (no server/DB imports).
 * Section -> Group -> Class. Class = cash flow line item.
 */
import type { Database } from "@/db/types";

export type CfNode = Database["public"]["Tables"]["cf_nodes"]["Row"];

export interface TreeGroup extends CfNode {
  children: CfNode[];
}
export interface TreeSection extends CfNode {
  children: TreeGroup[];
}

/** Build the nested Section -> Group -> Class tree from a flat node list. */
export function buildTree(nodes: CfNode[]): TreeSection[] {
  const byParent = new Map<string | null, CfNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parent_id) ?? [];
    arr.push(n);
    byParent.set(n.parent_id, arr);
  }
  const sort = (a: CfNode, b: CfNode) => a.sort_order - b.sort_order;
  const sections = (byParent.get(null) ?? [])
    .filter((n) => n.kind === "section")
    .sort(sort);
  return sections.map((sec) => ({
    ...sec,
    children: (byParent.get(sec.id) ?? [])
      .filter((n) => n.kind === "group")
      .sort(sort)
      .map((grp) => ({
        ...grp,
        children: (byParent.get(grp.id) ?? [])
          .filter((n) => n.kind === "class")
          .sort(sort),
      })),
  }));
}

export interface StructureIssue {
  text: string;
  severity: "warn" | "err";
}

/** Validation scaffolding - surfaced in the Structure Builder. */
export function validateStructure(tree: TreeSection[]): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const classLabels = new Map<string, number>();

  for (const section of tree) {
    if (section.children.length === 0) {
      issues.push({ text: `Section "${section.label}" has no groups.`, severity: "warn" });
    }
    for (const group of section.children) {
      if (group.children.length === 0) {
        issues.push({ text: `Group "${group.label}" has no classes.`, severity: "warn" });
      }
      for (const cls of group.children) {
        classLabels.set(cls.label, (classLabels.get(cls.label) ?? 0) + 1);
        if (cls.cash_direction === "neutral") {
          issues.push({
            text: `Class "${cls.label}" has no Cash In / Cash Out direction.`,
            severity: "warn",
          });
        }
      }
    }
  }
  for (const [label, count] of classLabels) {
    if (count > 1) {
      issues.push({ text: `Duplicate class name "${label}" (${count}).`, severity: "err" });
    }
  }
  return issues;
}

export function countNodes(tree: TreeSection[]) {
  let sections = 0,
    groups = 0,
    classes = 0,
    active = 0;
  for (const s of tree) {
    sections++;
    for (const g of s.children) {
      groups++;
      for (const c of g.children) {
        classes++;
        if (c.is_active) active++;
      }
    }
  }
  return { sections, groups, classes, active, inactive: classes - active };
}

// ---------------------------------------------------------------------------
// Recursive (any-depth) structure helpers. The CF_Actual structure nests beyond
// the legacy Section -> Group -> Class shape (e.g. Outflows > Total Technical >
// CAPEX > Cube Construction > leaf), so the Structure Builder uses these.
// ---------------------------------------------------------------------------

export interface TreeNode extends CfNode {
  children: TreeNode[];
}

/** Build the full nested tree to arbitrary depth from a flat node list. */
export function buildNodeTree(nodes: CfNode[]): TreeNode[] {
  const byParent = new Map<string | null, CfNode[]>();
  for (const n of nodes) {
    const arr = byParent.get(n.parent_id) ?? [];
    arr.push(n);
    byParent.set(n.parent_id, arr);
  }
  const sort = (a: CfNode, b: CfNode) => a.sort_order - b.sort_order;
  const build = (n: CfNode): TreeNode => ({
    ...n,
    children: (byParent.get(n.id) ?? []).slice().sort(sort).map(build),
  });
  return (byParent.get(null) ?? []).slice().sort(sort).map(build);
}

export interface TreeCounts {
  sections: number;
  groups: number;
  classes: number;
  active: number;
  inactive: number;
}

/** Count nodes by kind across the whole tree; active/inactive are class leaves. */
export function countTree(nodes: TreeNode[]): TreeCounts {
  const c: TreeCounts = { sections: 0, groups: 0, classes: 0, active: 0, inactive: 0 };
  const walk = (n: TreeNode) => {
    if (n.kind === "section") c.sections += 1;
    else if (n.kind === "group") c.groups += 1;
    else if (n.kind === "class") {
      c.classes += 1;
      if (n.is_active) c.active += 1;
      else c.inactive += 1;
    }
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return c;
}

/** Recursive validation: empty containers, undirected class leaves, dup names. */
export function validateTree(nodes: TreeNode[]): StructureIssue[] {
  const issues: StructureIssue[] = [];
  const classLabels = new Map<string, number>();
  const walk = (n: TreeNode) => {
    if ((n.kind === "section" || n.kind === "group") && n.children.length === 0) {
      issues.push({ text: `"${n.label}" has no child lines.`, severity: "warn" });
    }
    if (n.kind === "class") {
      classLabels.set(n.label, (classLabels.get(n.label) ?? 0) + 1);
      if (n.cash_direction === "neutral") {
        issues.push({
          text: `Class "${n.label}" has no Cash In / Out / Both direction.`,
          severity: "warn",
        });
      }
    }
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  for (const [label, count] of classLabels) {
    if (count > 1) {
      issues.push({ text: `Duplicate class name "${label}" [ ${count} ].`, severity: "err" });
    }
  }
  return issues;
}
