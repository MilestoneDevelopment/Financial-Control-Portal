import Link from "next/link";
import { TopBar } from "@/components/shell/TopBar";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { capabilityMap } from "@/lib/auth/guards";
import { formatAmount } from "@/lib/format/money";
import { PERIOD_STATUS_LABEL } from "@/lib/domain/period/lifecycle";
import {
  listCashFlowNodes,
  listCashFlowTransactions,
  listCashFlowPeriods,
  type CashFlowDateRange,
} from "@/lib/data/cashflow";
import { buildCashFlowTree, computeClosingBalance } from "@/lib/domain/cashflow/generate";
import { summarizeCashFlowCoverage, type CashFlowCoverageFact } from "@/lib/domain/cashflow/coverage";
import { formatCashFlowRows } from "@/lib/domain/cashflow/format";
import {
  adjacentPeriods,
  resolveOpeningBalance,
  ytdDateRange,
  isLockedOrClosed,
  canEditOpeningBalance,
  OPENING_STATE_LABEL,
  type OpeningResolution,
  type PeriodStatus,
} from "@/lib/domain/cashflow/periods";
import { CashFlowFilters } from "./CashFlowFilters";
import { CreatePeriodForm, OpeningBalanceForm } from "./PeriodControls";
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
  let canManagePeriods = false;
  let canSetOpening = false;
  let hasStructure = false;
  let periods: { id: string; label: string }[] = [];
  let roots: ReturnType<typeof buildCashFlowTree>["roots"] = [];
  let rows: ReturnType<typeof formatCashFlowRows> = [];
  let net = 0;
  let coverage = summarizeCashFlowCoverage([]);
  let scopeLabel = "All transactions";
  let usingDateRange = true;

  // Period-aware state (only populated when a period is selected).
  let inPeriodMode = false;
  let periodStatus: PeriodStatus | null = null;
  let periodEditable = false;
  let opening: OpeningResolution = { state: "missing", value: null, candidate: null };
  let ytd: { label: string; net: number } | null = null;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const caps = await capabilityMap(supabase, companyId, [
      "classification.review",
      "period.approve_lock",
      "period.set_opening_balance",
    ]);
    canReview = caps["classification.review"];
    canManagePeriods = caps["period.approve_lock"];
    canSetOpening = caps["period.set_opening_balance"];

    const allPeriods = await listCashFlowPeriods(companyId);
    periods = allPeriods.map((p) => ({ id: p.id, label: p.label }));

    const nodes = await listCashFlowNodes(companyId);
    hasStructure = nodes.some((n) => n.kind === "section");

    // Resolve the scope: a selected period wins over a manual date range.
    let range: CashFlowDateRange = {};
    const activePeriod = periodIdParam ? allPeriods.find((p) => p.id === periodIdParam) : undefined;
    if (activePeriod) {
      inPeriodMode = true;
      periodStatus = activePeriod.status;
      periodEditable = canEditOpeningBalance({
        status: activePeriod.status,
        isCorrectionMode: activePeriod.isCorrectionMode,
      });
      range = { dateFrom: activePeriod.dateFrom, dateTo: activePeriod.dateTo };
      scopeLabel = activePeriod.label;
      usingDateRange = false;
    } else {
      range = { dateFrom: fromParam || undefined, dateTo: toParam || undefined };
      if (fromParam || toParam) scopeLabel = `${fromParam || "start"} to ${toParam || "latest"}`;
    }

    const txns = await listCashFlowTransactions(companyId, range);
    const statement = buildCashFlowTree(nodes, txns);
    roots = statement.roots;
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

    if (activePeriod) {
      // Carried opening candidate = the previous period's closing, computed live
      // (prev opening + prev net). Only knowable when the previous period itself
      // has an opening balance; otherwise no candidate (never invented).
      const { previous } = adjacentPeriods(allPeriods, activePeriod.id);
      let previousClosing: number | null = null;
      if (previous && previous.openingBalance !== null) {
        const prevTxns = await listCashFlowTransactions(companyId, {
          dateFrom: previous.dateFrom,
          dateTo: previous.dateTo,
        });
        const prevNet = buildCashFlowTree(nodes, prevTxns).net;
        previousClosing = computeClosingBalance(previous.openingBalance, prevNet);
      }
      opening = resolveOpeningBalance({
        openingBalance: activePeriod.openingBalance,
        openingBalanceSource: activePeriod.openingBalanceSource,
        previousClosing,
      });

      // YTD: net from the fiscal year start through the selected period.
      const yr = ytdDateRange(activePeriod.year, activePeriod.month);
      const ytdTxns = await listCashFlowTransactions(companyId, { dateFrom: yr.dateFrom, dateTo: yr.dateTo });
      ytd = { label: yr.label, net: buildCashFlowTree(nodes, ytdTxns).net };
    }
  }

  const closing = computeClosingBalance(opening.value, net);
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

        {canManagePeriods && <CreatePeriodForm companyId={companyId} />}

        <div className={styles.scopeRow}>
          <span className={styles.rangeHint}>
            Scope: {scopeLabel}
            {usingDateRange && periods.length === 0
              ? " (no accounting periods yet - generating directly from transactions)"
              : ""}
          </span>
          {inPeriodMode && periodStatus && (
            <span className={styles.periodBadge} data-locked={isLockedOrClosed(periodStatus)}>
              {PERIOD_STATUS_LABEL[periodStatus]}
            </span>
          )}
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
                <div className={styles.covValue} data-tone={tone}>[ {value} ]</div>
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
                          r.emphasis
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
                                    : r.direction === "both"
                                      ? "in / out"
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
                {roots.map((s) => (
                  <div key={s.id} className={styles.totalLine}>
                    <span>{s.label}</span>
                    <span className={styles.num} data-negative={s.amount < 0}>{fmt(s.amount)}</span>
                  </div>
                ))}
                <div className={`${styles.totalLine} ${styles.netLine}`}>
                  <span>Net Cash Flow</span>
                  <span className={styles.num} data-negative={net < 0}>{fmt(net)}</span>
                </div>
                {ytd && (
                  <div className={styles.ytdLine}>
                    <span>{ytd.label}</span>
                    <span className={styles.num} data-negative={ytd.net < 0}>{fmt(ytd.net)}</span>
                  </div>
                )}
              </div>

              <div className={styles.balanceCard}>
                <div className={styles.balanceTitle}>Cash Balance</div>

                {opening.value !== null ? (
                  <div className={styles.totalLine}>
                    <span>
                      Opening Cash Balance
                      <span className={styles.srcTag}>{OPENING_STATE_LABEL[opening.state]}</span>
                    </span>
                    <span className={styles.num} data-negative={opening.value < 0}>{fmt(opening.value)}</span>
                  </div>
                ) : (
                  <div className={styles.balancePlaceholder}>
                    Opening balance is not set for this period.
                    {opening.state === "carried-candidate" && opening.candidate !== null && (
                      <div className={styles.carriedNote}>
                        Carried opening available from the previous period:{" "}
                        <strong>{fmt(opening.candidate)}</strong>.
                      </div>
                    )}
                  </div>
                )}

                {inPeriodMode && canSetOpening && periodIdParam && periodStatus && (
                  periodEditable ? (
                    <OpeningBalanceForm
                      companyId={companyId}
                      periodId={periodIdParam}
                      hasValue={opening.value !== null}
                      candidate={opening.state === "carried-candidate" ? opening.candidate : null}
                    />
                  ) : (
                    <div className={styles.lockNote}>
                      This period is {PERIOD_STATUS_LABEL[periodStatus].toLowerCase()}. Enable
                      Correction Mode to change the opening balance.
                    </div>
                  )
                )}

                <div className={styles.totalLine}>
                  <span>Net Cash Flow</span>
                  <span className={styles.num} data-negative={net < 0}>{fmt(net)}</span>
                </div>
                {/* Cash balance bridge line (Phase 5A, Decision 2): static 0.00; editable FX not modeled yet. */}
                <div className={styles.totalLine}>
                  <span>FX fluctuations</span>
                  <span className={styles.num}>{fmt(0)}</span>
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
