import "server-only";

/**
 * Cash-flow generation read queries (Phase 4A). RLS scopes every result to the
 * caller's accessible companies. All generation/coverage/format logic is pure in
 * lib/domain/cashflow/*; this module only maps DB rows into those shapes.
 */
import { createClient } from "@/lib/supabase/server";
import { getActiveVersion, getNodes } from "@/lib/data/structure";
import type { CashFlowNode, CashFlowTxn } from "@/lib/domain/cashflow/types";
import {
  periodDateRange,
  type PeriodStatus,
  type OpeningBalanceSource,
} from "@/lib/domain/cashflow/periods";

/** The active structure's nodes mapped into the generator's node shape. */
export async function listCashFlowNodes(companyId: string): Promise<CashFlowNode[]> {
  const version = await getActiveVersion(companyId);
  if (!version) return [];
  const nodes = await getNodes(version.id);
  return nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    parentId: n.parent_id,
    sortOrder: n.sort_order,
    cashDirection: n.cash_direction,
    isActive: n.is_active,
  }));
}

export interface CashFlowDateRange {
  dateFrom?: string; // inclusive, YYYY-MM-DD
  dateTo?: string; // inclusive, YYYY-MM-DD
}

/** A transaction in the selected range with everything generation + coverage need. */
export interface CashFlowTxnRow extends CashFlowTxn {
  date: string | null;
}

/**
 * All transactions for the company in the selected date range. We deliberately
 * fetch every status (not just confirmed) so the coverage panel can account for
 * unclassified / FX-pending / excluded rows - the generator filters for
 * eligibility, coverage explains the remainder. A date filter excludes rows with
 * no transaction_date (they cannot be placed in a range); the unbounded view
 * keeps them.
 */
export async function listCashFlowTransactions(
  companyId: string,
  range: CashFlowDateRange = {},
): Promise<CashFlowTxnRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("transactions")
    .select(
      "id, class_id, classification_status, classification_source, amount_gel, fx_status, transaction_date",
    )
    .eq("company_id", companyId);
  if (range.dateFrom) q = q.gte("transaction_date", range.dateFrom);
  if (range.dateTo) q = q.lte("transaction_date", range.dateTo);
  const { data, error } = await q
    .order("transaction_date", { ascending: true, nullsFirst: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((t) => ({
    id: t.id,
    classId: t.class_id,
    status: t.classification_status,
    source: t.classification_source,
    amountGel: t.amount_gel,
    fxStatus: t.fx_status,
    date: t.transaction_date,
  }));
}

export interface CashFlowPeriodOption {
  id: string;
  label: string;
  year: number;
  month: number | null;
  status: PeriodStatus;
  isCorrectionMode: boolean;
  openingBalance: number | null;
  openingBalanceSource: OpeningBalanceSource | null;
  closingBalance: number | null;
  fxFluctuations: number | null;
  dateFrom: string;
  dateTo: string;
}

/**
 * Periods available as cash-flow ranges, newest first. Each period yields a
 * concrete date range (whole month, or whole year when month is null) plus its
 * stored opening balance, source, status, and stored closing - all used verbatim
 * (never invented). The concrete range is derived by the pure `periodDateRange`.
 */
export async function listCashFlowPeriods(
  companyId: string,
): Promise<CashFlowPeriodOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("periods")
    .select("id, year, month, status, is_correction_mode, opening_balance, opening_balance_source, closing_balance, fx_fluctuations_gel")
    .eq("company_id", companyId)
    .order("year", { ascending: false })
    .order("month", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => {
    const { dateFrom, dateTo, label } = periodDateRange(p.year, p.month);
    return {
      id: p.id,
      label,
      year: p.year,
      month: p.month,
      status: p.status,
      isCorrectionMode: p.is_correction_mode,
      openingBalance: p.opening_balance,
      openingBalanceSource: p.opening_balance_source,
      closingBalance: p.closing_balance,
      fxFluctuations: p.fx_fluctuations_gel,
      dateFrom,
      dateTo,
    };
  });
}
