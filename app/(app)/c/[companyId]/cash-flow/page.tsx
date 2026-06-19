import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { formatAmount } from "@/lib/format/money";
import {
  listCashFlowNodes,
  listCashFlowTransactions,
  listCashFlowPeriods,
  type CashFlowDateRange,
} from "@/lib/data/cashflow";
import { buildCashFlowTree, computeClosingBalance } from "@/lib/domain/cashflow/generate";
import { summarizeCashFlowCoverage, type CashFlowCoverageFact } from "@/lib/domain/cashflow/coverage";
import { formatCashFlowRows } from "@/lib/domain/cashflow/format";
import { CashFlowFilters } from "./CashFlowFilters";
import styles from "./cash-flow.module.css";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const fmt = (n: number) => formatAmount(n, { decimals: 2 });

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<SP>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const fromParam = one(sp.from);
  const toParam = one(sp.to);
  const periodIdParam = one(sp.periodId);

  let canReview = false;
  let hasStructure = false;
  let periods: { id: string; label: string }[] = [];
  let sections: ReturnType<typeof buildCashFlowTree>["sections"] = [];
  let rows: ReturnType<typeof formatCashFlowRows> = [];
  let net = 0;
  let coverage = summarizeCashFlowCoverage([]);
  let openingBalance: number | null = null;
  let scopeLabel = "All transactions";
  let usingDateRange = true;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    canReview = (await capabilityMap(supabase, companyId, ["classification.review"]))["classification.review"];

    const allPeriods = await listCashFlowPeriods(companyId);
    periods = allPeriods.map((p) => ({ id: p.id, label: p.label }));

    // Resolve the scope: a selected period (carries its opening balance) wins
    // over a manual date range.
    let range: CashFlowDateRange = {};
    const activePeriod = periodIdParam ? allPeriods.find((p) => p.id === periodIdParam) : undefined;
    if (activePeriod) {
      range = { dateFrom: activePeriod.dateFrom, dateTo: activePeriod.dateTo };
      openingBalance = activePeriod.openingBalance;
      scopeLabel = activePeriod.label;
      usingDateRange = false;
    } else {
      range = { dateFrom: fromParam || undefined, dateTo: toParam || undefined };
      if (fromParam || toParam) scopeLabel = `${fromParam || "start"} to ${toParam || "latest"}`;
    }

    const nodes = await listCashFlowNodes(companyId);
    hasStructure = nodes.some((n) => n.kind === "section");
    const txns = await listCashFlowTransactions(companyId, range);

    const statement = buildCashFlowTree(nodes, txns);
    sections = statement.sections;
    net = statement.net;
    rows = formatCashFlowRows(statement);

    const dirById = new Map(
      nodes.filter((n) => n.kind === "class").map((n) => [n.id, n.cashDirection]),
    );
    const facts: CashFlowCoverageFact[] = txns.map((t) => ({
      id: t.id,
      classId: t.classId,
      status: t.status,
      source: t.source,
      amountGel: t.amountGel,
      fxStatus: t.fxStatus,
      classDirection: t.classId ? dirById.get(t.classId) ?? null : null,
    }));
    coverage = summarizeCashFlowCoverage(facts);
  }

  const closing = computeClosingBalance(openingBalance, net);
  const exclusionsTotal = coverage.unclassified + coverage.fxPending + coverage.excluded;

  return (
    <>
      <TopBar
        title="Cash Flow Statement"
        subtitle="Opening - Operating / Investing / Financing - Net - Closing"
        usesPeriod={false}
      />
      <div className={styles.pageBody}>
        <CashFlowFilters
          companyId={companyId}
          periods={periods}
          current={{ from: fromParam, to: toParam, periodId: periodIdParam }}
        />

        <div className={styles.rangeHint}>
          Scope: {scopeLabel}
          {usingDateRange && periods.length === 0
            ? " (no accounting periods yet - generating directly from transactions)"
            : ""}
        </div>

        <div className={styles.coverage}>
          <div className={styles.coverageCards}>
            {([
              ["Total", coverage.total, "default"],
              ["Included", coverage.included, "ok"],
              ["Unclassified", coverage.unclassified, coverage.unclassified > 0 ? "warn" : "muted"],
              ["FX pending", coverage.fxPending, coverage.fxPending > 0 ? "warn" : "muted"],
              ["Excluded", coverage.excluded, coverage.excluded > 0 ? "warn" : "muted"],
            ] as const).map(([label, value, tone]) => (
              <div key={label} className={styles.covCard}>
                <div className={styles.covValue} data-tone={tone}>{value}</div>
                <div className={styles.covLabel}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {!hasStructure ? (
          <div className={styles.notice}>
            No active cash flow structure for this company yet. Build the Section / Group / Class
            structure first, then generate the statement.
          </div>
        ) : (
          <>
            <div className={styles.statementCard}>
              <div className={styles.cardTitle}>Statement</div>
              {rows.length === 0 ? (
                <div className={styles.empty}>The active structure has no line items to show.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th className={styles.thRight}>Items</th>
                      <th className={styles.thRight}>GEL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={`${r.kind}-${i}`}
                        className={
                          r.kind === "section"
                            ? styles.rowSection
                            : r.kind === "group"
                              ? styles.rowGroup
                              : styles.rowClass
                        }
                      >
                        <td style={{ paddingLeft: 8 + r.depth * 18 }}>
                          <span className={styles.labelCell}>
                            {r.label}
                            {r.kind === "class" && r.direction && (
                              <span className={styles.dirTag} data-dir={r.direction}>
                                {r.direction === "in"
                                  ? "in"
                                  : r.direction === "out"
                                    ? "out"
                                    : "no direction"}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className={styles.count}>[ {r.count} ]</td>
                        <td className={styles.amount} data-negative={r.amount < 0}>{r.amountText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className={styles.summaryRow}>
              <div className={styles.totalsCard}>
                <div className={styles.totalsTitle}>Totals</div>
                {sections.map((s) => (
                  <div key={s.id} className={styles.totalLine}>
                    <span>{s.label}</span>
                    <span className={styles.num} data-negative={s.amount < 0}>{fmt(s.amount)}</span>
                  </div>
                ))}
                <div className={`${styles.totalLine} ${styles.netLine}`}>
                  <span>Net Cash Flow</span>
                  <span className={styles.num} data-negative={net < 0}>{fmt(net)}</span>
                </div>
              </div>

              <div className={styles.balanceCard}>
                <div className={styles.balanceTitle}>Cash Balance</div>
                {openingBalance === null ? (
                  <div className={styles.balancePlaceholder}>
                    Opening balance is not set for this period.
                  </div>
                ) : (
                  <div className={styles.totalLine}>
                    <span>Opening Cash Balance</span>
                    <span className={styles.num} data-negative={openingBalance < 0}>{fmt(openingBalance)}</span>
                  </div>
                )}
                <div className={styles.totalLine}>
                  <span>Net Cash Flow</span>
                  <span className={styles.num} data-negative={net < 0}>{fmt(net)}</span>
                </div>
                <div className={`${styles.totalLine} ${styles.netLine}`}>
                  <span>Closing Cash Balance</span>
                  <span className={styles.num} data-negative={closing !== null && closing < 0}>
                    {closing === null ? "-" : fmt(closing)}
                  </span>
                </div>
                {closing === null && (
                  <div className={styles.rangeHint}>
                    Closing = Opening Cash Balance + Net Cash Flow once an opening balance exists.
                  </div>
                )}
              </div>
            </div>

            {exclusionsTotal > 0 && (
              <div className={styles.exclusions}>
                <span className={styles.exclTag}>Not included in this statement:</span>
                <span>Unclassified [ {coverage.unclassified} ]</span>
                <span>FX pending [ {coverage.fxPending} ]</span>
                <span>Excluded [ {coverage.excluded} ]</span>
                {canReview && (
                  <Link href={`/c/${companyId}/classification`} className={styles.exclLink}>
                    Review and classify -&gt;
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
