/**
 * Pure classification coverage summary + unmatched-pair ranking (no DB - testable).
 */
import type { Database } from "@/db/types";

type Status = Database["public"]["Enums"]["tx_classification_status"];
type Source = Database["public"]["Enums"]["classification_source"] | null;

export interface CoverageFact {
  status: Status;
  source: Source;
}

export interface Coverage {
  total: number;
  confirmedManual: number;
  confirmedRule: number;
  suggested: number;
  unclassified: number;
  rejected: number;
  coveragePct: number; // confirmed / total, 0..100 (rounded)
}

export function summarizeCoverage(rows: CoverageFact[]): Coverage {
  const c: Coverage = {
    total: rows.length,
    confirmedManual: 0,
    confirmedRule: 0,
    suggested: 0,
    unclassified: 0,
    rejected: 0,
    coveragePct: 0,
  };
  for (const r of rows) {
    if (r.status === "confirmed") {
      if (r.source === "manual") c.confirmedManual += 1;
      else c.confirmedRule += 1;
    } else if (r.status === "suggested") c.suggested += 1;
    else if (r.status === "rejected") c.rejected += 1;
    else c.unclassified += 1;
  }
  const confirmed = c.confirmedManual + c.confirmedRule;
  c.coveragePct = c.total === 0 ? 0 : Math.round((confirmed / c.total) * 100);
  return c;
}

export interface PairFact {
  status: Status;
  debit: string | null;
  credit: string | null;
}

export interface UnmatchedPair {
  pair: string;
  debit: string | null;
  credit: string | null;
  count: number;
}

/** Most common debit/credit pairs among still-unresolved (unclassified/suggested) rows. */
export function topUnmatchedPairs(rows: PairFact[], limit = 5): UnmatchedPair[] {
  const map = new Map<string, UnmatchedPair>();
  for (const r of rows) {
    if (r.status !== "unclassified" && r.status !== "suggested") continue;
    const debit = r.debit ?? "—";
    const credit = r.credit ?? "—";
    const pair = `${debit} / ${credit}`;
    const cur = map.get(pair);
    if (cur) cur.count += 1;
    else map.set(pair, { pair, debit: r.debit, credit: r.credit, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Re-run targeting plan from user options. Manual rows are always excluded by the caller. */
export interface RerunOptions {
  includeUnclassified: boolean;
  includeSuggested: boolean;
  overwriteRuleConfirmed: boolean;
}

export function rerunStatuses(opts: RerunOptions): Status[] {
  const s: Status[] = [];
  if (opts.includeUnclassified) s.push("unclassified");
  if (opts.includeSuggested) s.push("suggested");
  if (opts.overwriteRuleConfirmed) s.push("confirmed"); // restricted to source='rule' by the query
  return s;
}
