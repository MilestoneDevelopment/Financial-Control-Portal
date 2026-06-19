import "server-only";

/**
 * Cash-flow generation read queries (Phase 4A). RLS scopes every result to the
 * caller's accessible companies. All generation/coverage/format logic is pure in
 * lib/domain/cashflow/*; this module only maps DB rows into those shapes.
 */
import { createClient } from "@/lib/supabase/server";
import { getActiveVersion, getNodes } from "@/lib/data/structure";
import type { CashFlowNode, CashFlowTxn } from "@/lib/domain/cashflow/types";

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
  openingBalance: number | null;
  dateFrom: string;
  dateTo: string;
}

/**
 * Periods available as cash-flow ranges, newest first. Each period yields a
 * concrete date range (whole month, or whole year when month is null) plus its
 * stored opening balance - which the page uses verbatim and never invents.
 */
export async function listCashFlowPeriods(
  companyId: string,
): Promise<CashFlowPeriodOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("periods")
    .select("id, year, month, opening_balance")
    .eq("company_id", companyId)
    .order("year", { ascending: false })
    .order("month", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => {
    const { dateFrom, dateTo, label } = periodRange(p.year, p.month);
    return {
      id: p.id,
      label,
      year: p.year,
      month: p.month,
      openingBalance: p.opening_balance,
      dateFrom,
      dateTo,
    };
  });
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Concrete inclusive date range + label for a period (month or whole year). */
function periodRange(year: number, month: number | null): {
  dateFrom: string;
  dateTo: string;
  label: string;
} {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (month === null) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`, label: `FY${year}` };
  }
  // month is 1-12 in the periods table; last day via day 0 of the next month.
  const lastDay = new Date(year, month, 0).getDate();
  return {
    dateFrom: `${year}-${pad(month)}-01`,
    dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
    label: `${MONTHS[month - 1]} ${year}`,
  };
}
