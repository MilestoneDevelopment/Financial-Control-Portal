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
  listCashFlowTransactionsByPeriod,
  listCashFlowPeriods,
  type CashFlowDateRange,
} from "@/lib/data/cashflow";
import { buildCashFlowTree, computeClosingBalance } from "@/lib/domain/cashflow/generate";
import { buildCashFlowMatrix, type MatrixPeriodInput } from "@/lib/domain/cashflow/matrix";
import { summarizeCashFlowCoverage, type CashFlowCoverageFact } from "@/lib/domain/cashflow/coverage";
import { formatCashFlowRows } from "@/lib/domain/cashflow/format";
import {
  adjacentPeriods,
  resolveOpeningBalance,
  isLockedOrClosed,
  canEditOpeningBalance,
  OPENING_STATE_LABEL,
  type OpeningResolution,
  type PeriodStatus,
} from "@/lib/domain/cashflow/periods";
import { CashFlowFilters, type CashFlowView } from "./CashFlowFilters";
import { OpeningBalanceForm } from "./PeriodControls";
import { MatrixTable } from "./MatrixTable";
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
  const viewParam: CashFlowView = one(sp.view) === "matrix" ? "matrix" : "statement";

  let canManagePeriods = false;
  let canSetOpening = false;
  let hasStructure = false;
  let hasAnyPeriod = false;
  let periods: { id: string; label: string }[] = [];
  let roots: ReturnType<typeof buildCashFlowTree>["roots"] = [];
  let rows: ReturnType<typeof formatCashFlowRows> = [];
  let net = 0;
  let coverage = summarizeCashFlowCoverage([]);
  let scopeLabel = "All transactions";
  let usingDateRange = true;
  let matrix: ReturnType<typeof buildCashFlowMatrix> | null = null;

  // Period-aware state (only populated when a period is selected).
  let inPeriodMode = false;
  let periodStatus: PeriodStatus | null = null;
  let periodEditable = false;
  let opening: OpeningResolution = { state: "missing", value: null, candidate: null };
  let periodFx = 0;

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const caps = await capabilityMap(supabase, companyId, [
      "period.approve_lock",
      "period.set_opening_balance",
    ]);
    canManagePeriods = caps["period.approve_lock"];
    canSetOpening = caps["period.set_opening_balance"];

    const allPeriods = await listCashFlowPeriods(companyId);
    periods = allPeriods.map((p) => ({ id: p.id, label: p.label }));
    hasAnyPeriod = allPeriods.length > 0;

    const nodes = await listCashFlowNodes(companyId);
    hasStructure = nodes.some((n) => n.kind === "section");

    if (viewParam === "matrix" && hasStructure) {
      // Matrix view: one column per monthly period, chronological. Year-level
      // (month=null) periods are excluded - the matrix is month-by-month by design.
      const monthly = allPeriods
        .filter((p) => p.month !== null)
        .slice()
        .sort((a, b) => (a.year !== b.year ? a.year - b.year : (a.month ?? 0) - (b.month ?? 0)));
      const matrixPeriods: MatrixPeriodInput[] = monthly.map((p) => ({
        id: p.id,
        year: p.year,
        month: p.month,
        label: p.label,
        openingBalance: p.openingBalance,
        fxFluctuations: p.fxFluctuations,
        storedClosingBalance: p.closingBalance,
      }));
      const txnsByPeriod = await listCashFlowTransactionsByPeriod(
        companyId,
        monthly.map((p) => ({ id: p.id, dateFrom: p.dateFrom, dateTo: p.dateTo })),
      );
      matrix = buildCashFlowMatrix(nodes, matrixPeriods, txnsByPeriod);
      scopeLabel = monthly.length > 0
        ? `${monthly[0].label} - ${monthly[monthly.length - 1].label}`
        : "No monthly periods";
      // Coverage in matrix mode reflects all transactions in the matrix range so
      // the cards still answer "what is not in the statement?".
      const dateFrom = monthly[0]?.dateFrom;
      const dateTo = monthly[monthly.length - 1]?.dateTo;
      const allTxns = dateFrom && dateTo
        ? await listCashFlowTransactions(companyId, { dateFrom, dateTo })
        : [];
      const dirByIdM = new Map(
        nodes.filter((n) => n.kind === "class").map((n) => [n.id, n.cashDirection]),
      );
      const factsM: CashFlowCoverageFact[] = allTxns.map((t) => ({
        id: t.id,
        classId: t.classId,
        status: t.status,
        source: t.source,
        amountGel: t.amountGel,
        fxStatus: t.fxStatus,
        classDirection: t.classId ? dirByIdM.get(t.classId) ?? null : null,
      }));
      coverage = summarizeCashFlowCoverage(factsM);
    }

    // Resolve the scope: an explicitly selected period wins; otherwise, in
    // Statement mode with no manual date range, default to the latest monthly
    // period (allPeriods is ordered newest-first, so the first month-level entry
    // is the latest). A manual range or "no periods" keeps the prior behavior.
    let range: CashFlowDateRange = {};
    const latestMonthly = allPeriods.find((p) => p.month !== null);
    const activePeriod = periodIdParam
      ? allPeriods.find((p) => p.id === periodIdParam)
      : !fromParam && !toParam && viewParam !== "matrix"
        ? latestMonthly
        : undefined;
    if (activePeriod) {
      inPeriodMode = true;
      periodStatus = activePeriod.status;
      periodEditable = canEditOpeningBalance({
        status: activePeriod.status,
        isCorrectionMode: activePeriod.isCorrectionMode,
      });
      periodFx = activePeriod.fxFluctuations ?? 0;
      range = { dateFrom: activePeriod.dateFrom, dateTo: activePeriod.dateTo };
      scopeLabel = activePeriod.label;
      usingDateRange = false;
    } else {
      range = { dateFrom: fromParam || undefined, dateTo: toParam || undefined };
      if (fromParam || toParam) scopeLabel = `${fromParam || "start"} to ${toParam || "latest"}`;
    }

    // Statement-mode aggregation (matrix mode already populated its own coverage).
    if (viewParam !== "matrix") {
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
    }

    if (activePeriod && viewParam !== "matrix") {
      // Carried opening candidate = the previous period's closing, computed live
      // (prev opening + prev net). Only knowable when the previous period itself
      // has an opening balance; otherwise no candidate (never invented).
      const { previous } = adjacentPeriods(allPeriods, activePeriod.id);
      let previousClosing: number | null = null;
      if (previous && previous.openingBalance !== null) {
        // (previous closing includes its FX so the carried opening matches)
        const prevTxns = await listCashFlowTransactions(companyId, {
          dateFrom: previous.dateFrom,
          dateTo: previous.dateTo,
        });
        const prevNet = buildCashFlowTree(nodes, prevTxns).net;
        previousClosing = computeClosingBalance(previous.openingBalance, prevNet, previous.fxFluctuations ?? 0);
      }
      opening = resolveOpeningBalance({
        openingBalance: activePeriod.openingBalance,
        openingBalanceSource: activePeriod.openingBalanceSource,
        previousClosing,
      });
    }
  }

  const closing = computeClosingBalance(opening.value, net, periodFx);

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
          current={{ from: fromParam, to: toParam, periodId: periodIdParam, view: viewParam }}
        />

        {!hasAnyPeriod && hasStructure && canManagePeriods && (
          <div className={styles.scopeRow}>
            <span className={styles.rangeHint}>
              No accounting periods yet. Create and manage periods in{" "}
              <Link href={`/c/${companyId}/dashboard`} className={styles.exclLink}>
                Period management
              </Link>
              .
            </span>
          </div>
        )}

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

        {viewParam !== "matrix" && (
          <div className={styles.dataQuality}>
            <span className={styles.dqLabel}>Data quality</span>
            {coverage.unclassified === 0 && coverage.fxPending === 0 && coverage.excluded === 0 ? (
              <span className={styles.dqOk}>All transactions classified</span>
            ) : (
              <>
                {coverage.unclassified > 0 && (
                  <span
                    className={styles.dqWarn}
                    title="Transactions with no cash flow line assigned."
                  >
                    Unclassified [ {coverage.unclassified} ]
                  </span>
                )}
                {coverage.fxPending > 0 && (
                  <span
                    className={styles.dqWarn}
                    title="Foreign-currency transactions waiting for an exchange rate. Not yet included in totals."
                  >
                    FX pending [ {coverage.fxPending} ]
                  </span>
                )}
                {coverage.excluded > 0 && (
                  <span
                    className={styles.dqWarn}
                    title="Not included: needs review, has no amount, or is a non-cash line."
                  >
                    Excluded [ {coverage.excluded} ]
                  </span>
                )}
              </>
            )}
          </div>
        )}

        {!hasStructure ? (
          <div className={styles.notice}>
            No active cash flow structure for this company yet. Build the Section / Group / Class
            structure first, then generate the statement.
          </div>
        ) : viewParam === "matrix" ? (
          <div className={styles.statementCard}>
            <div className={styles.cardTitle}>Matrix</div>
            {matrix ? (
              <MatrixTable model={matrix} />
            ) : (
              <div className={styles.empty}>No matrix data.</div>
            )}
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
                      <th className={styles.thRight} title="Transactions included in this line.">Transactions</th>
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

            {/* Cash-flow bridge: Opening -> section flows -> Net -> FX -> Closing. */}
            <div className={styles.bridgeCard}>
              <div className={styles.bridgeTitle}>Cash Flow Bridge</div>

              <div className={styles.totalLine}>
                <span>
                  Opening Cash Balance
                  {opening.value !== null && (
                    <span className={styles.srcTag}>{OPENING_STATE_LABEL[opening.state]}</span>
                  )}
                </span>
                <span className={styles.num} data-negative={opening.value !== null && opening.value < 0}>
                  {opening.value === null ? "-" : fmt(opening.value)}
                </span>
              </div>

              {opening.value === null && (
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

              {roots.map((s) => (
                <div key={s.id} className={`${styles.totalLine} ${styles.bridgeIndent}`}>
                  <span>{s.label}</span>
                  <span className={styles.num} data-negative={s.amount < 0}>{fmt(s.amount)}</span>
                </div>
              ))}

              <div className={`${styles.totalLine} ${styles.netLine}`}>
                <span>Net Cash Change</span>
                <span className={styles.num} data-negative={net < 0}>{fmt(net)}</span>
              </div>
              <div className={styles.totalLine}>
                <span>FX fluctuations</span>
                <span className={styles.num} data-negative={periodFx < 0}>{fmt(periodFx)}</span>
              </div>
              <div className={`${styles.totalLine} ${styles.netLine}`}>
                <span title="Opening + Net Cash Change + FX fluctuations">Closing Cash Balance</span>
                <span className={styles.num} data-negative={closing !== null && closing < 0}>
                  {closing === null ? "-" : fmt(closing)}
                </span>
              </div>
            </div>

          </>
        )}
      </div>
    </>
  );
}
