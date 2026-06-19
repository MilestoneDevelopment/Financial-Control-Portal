import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { listAccountingFiles } from "@/lib/data/uploads";
import {
  listActiveClasses,
  listTransactionsForReview,
  listClassificationFacts,
  type TxFilters,
} from "@/lib/data/classification";
import { summarizeCoverage, topUnmatchedPairs } from "@/lib/domain/classification/coverage";
import { ClassificationClient, type TxRow, type Filters } from "./ClassificationClient";
import styles from "./classification.module.css";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ClassificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<SP>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;

  const filters: Filters = {
    fileId: one(sp.fileId),
    status: one(sp.status),
    currency: one(sp.currency),
    dateFrom: one(sp.dateFrom),
    dateTo: one(sp.dateTo),
    search: one(sp.search),
  };

  let canAssign = false;
  let canRun = false;
  let canManageRules = false;
  let classes: { id: string; label: string; cashDirection: string }[] = [];
  let files: { id: string; filename: string }[] = [];
  let rows: TxRow[] = [];
  let coverage = summarizeCoverage([]);
  let topUnmatched: { pair: string; count: number }[] = [];
  let fxPending = 0;
  let activeRules = 0;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const caps = await capabilityMap(supabase, companyId, [
      "classification.assign",
      "classification.run",
      "classification.manage_rules",
    ]);
    canAssign = caps["classification.assign"];
    canRun = caps["classification.run"];
    canManageRules = caps["classification.manage_rules"];

    classes = await listActiveClasses(companyId);
    files = (await listAccountingFiles(companyId)).map((f) => ({ id: f.id, filename: f.original_filename }));

    const facts = await listClassificationFacts(companyId);
    coverage = summarizeCoverage(facts);
    topUnmatched = topUnmatchedPairs(facts).map((p) => ({ pair: p.pair, count: p.count }));
    fxPending = facts.filter((f) => f.fxStatus === "pending").length;
    const { count } = await supabase
      .from("classification_rules")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_active", true);
    activeRules = count ?? 0;

    // Server filters: file / status / currency / date (search is client-side live).
    const dbFilters: TxFilters = {
      fileId: filters.fileId || undefined,
      status: (filters.status || undefined) as TxFilters["status"],
      currency: (filters.currency || undefined) as TxFilters["currency"],
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
    };
    rows = (await listTransactionsForReview(companyId, dbFilters)).map((t) => ({
      id: t.id,
      date: t.transaction_date,
      description: t.description,
      debit: t.debit_account,
      credit: t.credit_account,
      amount: t.original_amount,
      currency: t.original_currency,
      amountGel: t.amount_gel,
      status: t.classification_status,
      classId: t.class_id,
      source: t.classification_source,
    }));
  }

  return (
    <>
      <TopBar
        title="Classification Review"
        subtitle="Classify accounting transactions into cash flow line items"
        usesPeriod={false}
      />
      <div className={styles.pageBody}>
        <div className={styles.coverage}>
          <div className={styles.coverageCards}>
            {[
              ["Coverage", `${coverage.coveragePct}%`],
              ["Total", coverage.total],
              ["Manual", coverage.confirmedManual],
              ["By rule", coverage.confirmedRule],
              ["Needs review", coverage.suggested],
              ["Unclassified", coverage.unclassified],
              ["FX pending", fxPending],
              ["Active rules", activeRules],
            ].map(([label, value]) => (
              <div key={label} className={styles.covCard}>
                <div className={styles.covValue}>{value}</div>
                <div className={styles.covLabel}>{label}</div>
              </div>
            ))}
          </div>
          <div className={styles.coverageSide}>
            {canManageRules && (
              <Link href={`/c/${companyId}/classification/rules`} className={styles.btnSm}>
                Manage rules
              </Link>
            )}
            {topUnmatched.length > 0 && (
              <div className={styles.unmatched}>
                <span className={styles.unmatchedTitle}>Top unmatched pairs:</span>
                {topUnmatched.map((u) => (
                  <span key={u.pair} className={styles.unmatchedItem}>{u.pair} ({u.count})</span>
                ))}
              </div>
            )}
          </div>
        </div>

        <ClassificationClient
          companyId={companyId}
          canAssign={canAssign}
          canRun={canRun}
          canManageRules={canManageRules}
          classes={classes}
          files={files}
          rows={rows}
          filters={filters}
        />
      </div>
    </>
  );
}
