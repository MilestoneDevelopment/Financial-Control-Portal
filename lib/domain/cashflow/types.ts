/**
 * Shared types for the cash-flow generation layer (Phase 4A).
 *
 * These are intentionally decoupled from the full database Row types so the pure
 * generation/coverage/format helpers stay testable with small literals. The data
 * layer maps `cf_nodes` / `transactions` rows into these shapes.
 */
import type { Database } from "@/db/types";

export type CashDirection = Database["public"]["Enums"]["cash_direction"];
export type CfNodeKind = Database["public"]["Enums"]["cf_node_kind"];
export type TxStatus = Database["public"]["Enums"]["tx_classification_status"];
export type TxSource = Database["public"]["Enums"]["classification_source"] | null;
export type FxStatus = Database["public"]["Enums"]["fx_status"];

/** Minimal cash-flow structure node shape the generator needs. */
export interface CashFlowNode {
  id: string;
  kind: CfNodeKind;
  label: string;
  parentId: string | null;
  sortOrder: number;
  cashDirection: CashDirection;
  isActive: boolean;
}

/** Minimal transaction shape the generator + coverage need. */
export interface CashFlowTxn {
  id: string;
  classId: string | null;
  status: TxStatus;
  source: TxSource;
  amountGel: number | null;
  fxStatus: FxStatus;
}

/**
 * A node in the rolled-up cash-flow tree. The tree is recursive to arbitrary
 * depth (CF_Actual nests Section > Outflows > Marketing > channel > leaf), so a
 * single node shape carries every level. `amount` is signed GEL: a leaf carries
 * its own classified rollup; a container (section/group) carries the signed sum
 * of its descendant leaves. `count` is the included-transaction count in the
 * subtree.
 */
export interface CashFlowTreeNode {
  id: string;
  kind: CfNodeKind;
  label: string;
  cashDirection: CashDirection;
  amount: number;
  count: number;
  children: CashFlowTreeNode[];
}

/** The generated statement: top-level sections (recursive) + net + included count. */
export interface CashFlowStatement {
  roots: CashFlowTreeNode[];
  net: number;
  includedCount: number;
}
