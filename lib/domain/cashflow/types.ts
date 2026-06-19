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

/** A rolled-up class line item (cash flow line). Amount is signed GEL. */
export interface ClassRow {
  id: string;
  label: string;
  cashDirection: CashDirection;
  amount: number;
  count: number;
}
/** A rolled-up group. Amount = sum of its class amounts. */
export interface GroupRow {
  id: string;
  label: string;
  amount: number;
  count: number;
  classes: ClassRow[];
}
/** A rolled-up section. Amount = sum of its group amounts. */
export interface SectionRow {
  id: string;
  label: string;
  amount: number;
  count: number;
  groups: GroupRow[];
}

/** The generated statement: ordered sections + net + how many txns were included. */
export interface CashFlowStatement {
  sections: SectionRow[];
  net: number;
  includedCount: number;
}
