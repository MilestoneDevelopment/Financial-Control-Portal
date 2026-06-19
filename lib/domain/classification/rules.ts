/**
 * Pure classification-rule validation + normalization (no DB - testable).
 * Rejects empty/match-everything rules and enforces per-type required fields.
 */
import type { RuleType, CashDirection, Currency } from "./engine.ts";

export interface RuleInput {
  classId: string;
  name: string;
  ruleType: RuleType;
  priority: number;
  confidenceScore: number;
  isActive: boolean;
  debitAccountPattern: string | null;
  creditAccountPattern: string | null;
  descriptionPattern: string | null;
  currency: Currency | null;
  minAmount: number | null;
  maxAmount: number | null;
  cashDirection: CashDirection | null;
}

export interface RuleValidation {
  ok: boolean;
  errors: string[];
  cleaned: RuleInput;
}

const RULE_TYPES: RuleType[] = [
  "account_exact",
  "account_pair",
  "description_contains",
  "description_regex",
  "amount_direction",
  "combined",
];

function trimOrNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** A direction filter that actually constrains (neutral is treated as no filter). */
function hasRealDirection(d: CashDirection | null): boolean {
  return d === "in" || d === "out";
}

export function validateRuleInput(raw: RuleInput): RuleValidation {
  const errors: string[] = [];
  const cleaned: RuleInput = {
    classId: (raw.classId ?? "").trim(),
    name: (raw.name ?? "").trim(),
    ruleType: raw.ruleType,
    priority: raw.priority,
    confidenceScore: raw.confidenceScore,
    isActive: raw.isActive,
    debitAccountPattern: trimOrNull(raw.debitAccountPattern),
    creditAccountPattern: trimOrNull(raw.creditAccountPattern),
    descriptionPattern: trimOrNull(raw.descriptionPattern),
    currency: raw.currency,
    minAmount: raw.minAmount,
    maxAmount: raw.maxAmount,
    cashDirection: raw.cashDirection,
  };

  if (!cleaned.classId) errors.push("A target class is required.");
  if (!cleaned.name) errors.push("Rule name is required.");
  if (!RULE_TYPES.includes(cleaned.ruleType)) errors.push("Invalid rule type.");
  if (!Number.isInteger(cleaned.priority)) errors.push("Priority must be an integer.");
  if (!(cleaned.confidenceScore >= 0 && cleaned.confidenceScore <= 1)) {
    errors.push("Confidence must be between 0 and 1.");
  }
  if (cleaned.minAmount !== null && cleaned.maxAmount !== null && cleaned.minAmount > cleaned.maxAmount) {
    errors.push("Min amount cannot exceed max amount.");
  }

  switch (cleaned.ruleType) {
    case "account_pair":
      if (!cleaned.debitAccountPattern || !cleaned.creditAccountPattern) {
        errors.push("Account-pair rules need both debit and credit account patterns.");
      }
      break;
    case "account_exact":
      if (!cleaned.debitAccountPattern && !cleaned.creditAccountPattern) {
        errors.push("Account-exact rules need a debit and/or credit account pattern.");
      }
      break;
    case "description_contains":
      if (!cleaned.descriptionPattern) errors.push("Description rules need a description pattern.");
      break;
    case "description_regex":
      if (!cleaned.descriptionPattern) {
        errors.push("Description rules need a description pattern.");
      } else {
        try {
          new RegExp(cleaned.descriptionPattern);
        } catch {
          errors.push("Description pattern is not a valid regular expression.");
        }
      }
      break;
    case "amount_direction":
      if (
        cleaned.currency === null &&
        cleaned.minAmount === null &&
        cleaned.maxAmount === null &&
        !hasRealDirection(cleaned.cashDirection)
      ) {
        errors.push("Amount/direction rules need a currency, amount band, or in/out direction.");
      }
      break;
    case "combined":
      if (!cleaned.debitAccountPattern && !cleaned.creditAccountPattern && !cleaned.descriptionPattern) {
        errors.push("Combined rules need at least one account or description condition.");
      }
      break;
  }

  return { ok: errors.length === 0, errors, cleaned };
}
