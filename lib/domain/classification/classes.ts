/**
 * Pure derivation of classification class options from structure nodes (testable).
 * The single source of truth for "which classes can a transaction/rule target":
 * active `class` nodes of the company's active structure version. Company/version
 * scoping is enforced upstream by the data layer (getActiveVersion + getNodes).
 */
import type { Database } from "@/db/types";
import type { CfNode } from "@/lib/domain/structure/tree";

export type CashDirection = Database["public"]["Enums"]["cash_direction"];

export interface ClassOption {
  id: string;
  label: string;
  cashDirection: CashDirection;
}

export function activeClassOptions(nodes: CfNode[]): ClassOption[] {
  return nodes
    .filter((n) => n.kind === "class" && n.is_active)
    .map((n) => ({ id: n.id, label: n.label, cashDirection: n.cash_direction }));
}
