/**
 * Deterministic, rule-based transaction classification (no DB / no AI - testable).
 *
 * Maps a transaction to a cf_nodes class via company-scoped rules. Priority:
 *   combined > account_pair > account_exact > description_(contains|regex) > amount_direction
 * then by each rule's numeric `priority` (lower first). Outcome maps to the
 * existing tx_classification_status enum:
 *   confirmed   = classified (one unambiguous best match)
 *   suggested   = needs_review (best-priority rules disagree on the class)
 *   unclassified = no rule matched
 * Never guesses: ambiguity -> suggested with no class.
 */
import type { Database } from "@/db/types";
import { normalizeText, normalizeAccount } from "./normalize.ts";

export type RuleType = Database["public"]["Enums"]["classification_rule_type"];
export type CashDirection = Database["public"]["Enums"]["cash_direction"];
export type Currency = Database["public"]["Enums"]["currency"];
export type ClassificationStatus = Database["public"]["Enums"]["tx_classification_status"];

export interface ClassifiableTx {
  debitAccount: string | null;
  creditAccount: string | null;
  description: string | null;
  originalAmount: number | null;
  amountGel: number | null;
  currency: Currency | null;
}

export interface ClassRule {
  id: string;
  classId: string;
  ruleType: RuleType;
  priority: number;
  isActive: boolean;
  debitAccountPattern: string | null;
  creditAccountPattern: string | null;
  descriptionPattern: string | null;
  currency: Currency | null;
  minAmount: number | null;
  maxAmount: number | null;
  cashDirection: CashDirection | null;
  confidenceScore: number;
}

export interface ClassificationResult {
  status: ClassificationStatus; // 'confirmed' | 'suggested' | 'unclassified'
  classId: string | null;
  matchedRuleId: string | null;
  confidence: number | null;
  reason: string;
}

const TYPE_RANK: Record<RuleType, number> = {
  combined: 0,
  account_pair: 1,
  account_exact: 2,
  description_contains: 3,
  description_regex: 3,
  amount_direction: 4,
};

function txAmount(tx: ClassifiableTx): number | null {
  const a = tx.originalAmount ?? tx.amountGel;
  return a === null ? null : Math.abs(a);
}

function impliedDirection(tx: ClassifiableTx): CashDirection {
  const a = tx.originalAmount ?? tx.amountGel ?? 0;
  if (a > 0) return "in";
  if (a < 0) return "out";
  return "neutral";
}

/** Optional shared filters (currency / amount band / direction) applied to any rule. */
function passesFilters(tx: ClassifiableTx, rule: ClassRule): boolean {
  if (rule.currency && tx.currency !== rule.currency) return false;
  const amt = txAmount(tx);
  if (rule.minAmount !== null && (amt === null || amt < rule.minAmount)) return false;
  if (rule.maxAmount !== null && (amt === null || amt > rule.maxAmount)) return false;
  if (rule.cashDirection && rule.cashDirection !== "neutral" && impliedDirection(tx) !== rule.cashDirection) {
    return false;
  }
  return true;
}

function matchesType(tx: ClassifiableTx, rule: ClassRule): boolean {
  const d = normalizeAccount(tx.debitAccount);
  const c = normalizeAccount(tx.creditAccount);
  const desc = normalizeText(tx.description);
  switch (rule.ruleType) {
    case "account_pair":
      if (!rule.debitAccountPattern || !rule.creditAccountPattern) return false;
      return d === normalizeAccount(rule.debitAccountPattern) && c === normalizeAccount(rule.creditAccountPattern);
    case "account_exact": {
      const dp = rule.debitAccountPattern;
      const cp = rule.creditAccountPattern;
      if (!dp && !cp) return false;
      if (dp && d !== normalizeAccount(dp)) return false;
      if (cp && c !== normalizeAccount(cp)) return false;
      return true;
    }
    case "description_contains":
      if (!rule.descriptionPattern) return false;
      return desc.includes(normalizeText(rule.descriptionPattern));
    case "description_regex":
      if (!rule.descriptionPattern) return false;
      try {
        return new RegExp(rule.descriptionPattern, "i").test(tx.description ?? "");
      } catch {
        return false;
      }
    case "amount_direction":
      // Purely the shared filters; require at least one to be set.
      return (
        rule.currency !== null ||
        rule.minAmount !== null ||
        rule.maxAmount !== null ||
        rule.cashDirection !== null
      );
    case "combined": {
      if (rule.debitAccountPattern && d !== normalizeAccount(rule.debitAccountPattern)) return false;
      if (rule.creditAccountPattern && c !== normalizeAccount(rule.creditAccountPattern)) return false;
      if (rule.descriptionPattern && !desc.includes(normalizeText(rule.descriptionPattern))) return false;
      return true;
    }
  }
}

/** Whether a single rule matches a transaction (used by classify + preview). */
export function ruleMatchesTx(tx: ClassifiableTx, rule: ClassRule): boolean {
  if (!rule.isActive) return false;
  if (!passesFilters(tx, rule)) return false;
  return matchesType(tx, rule);
}

export function classifyTransaction(tx: ClassifiableTx, rules: ClassRule[]): ClassificationResult {
  const matched = rules.filter((r) => ruleMatchesTx(tx, r));
  if (matched.length === 0) {
    return { status: "unclassified", classId: null, matchedRuleId: null, confidence: null, reason: "No matching rule." };
  }
  matched.sort((a, b) => {
    const ra = TYPE_RANK[a.ruleType];
    const rb = TYPE_RANK[b.ruleType];
    return ra !== rb ? ra - rb : a.priority - b.priority;
  });
  const best = matched[0];
  const topRank = TYPE_RANK[best.ruleType];
  const conflicts = matched.filter(
    (r) => TYPE_RANK[r.ruleType] === topRank && r.priority === best.priority && r.classId !== best.classId,
  );
  if (conflicts.length > 0) {
    return {
      status: "suggested",
      classId: null,
      matchedRuleId: null,
      confidence: null,
      reason: `Conflicting rules at priority ${best.priority} — needs review.`,
    };
  }
  return {
    status: "confirmed",
    classId: best.classId,
    matchedRuleId: best.id,
    confidence: best.confidenceScore,
    reason: `Matched ${best.ruleType} rule (priority ${best.priority}).`,
  };
}
