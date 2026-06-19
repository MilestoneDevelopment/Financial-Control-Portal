import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTransaction, ruleMatchesTx, type ClassRule, type ClassifiableTx } from "./engine.ts";

function rule(p: Partial<ClassRule>): ClassRule {
  return {
    id: "r",
    classId: "class-x",
    ruleType: "account_exact",
    priority: 100,
    isActive: true,
    debitAccountPattern: null,
    creditAccountPattern: null,
    descriptionPattern: null,
    currency: null,
    minAmount: null,
    maxAmount: null,
    cashDirection: null,
    confidenceScore: 0.9,
    ...p,
  };
}

function tx(p: Partial<ClassifiableTx>): ClassifiableTx {
  return {
    debitAccount: null,
    creditAccount: null,
    description: null,
    originalAmount: null,
    amountGel: null,
    currency: null,
    ...p,
  };
}

test("no rules / no match -> unclassified", () => {
  assert.equal(classifyTransaction(tx({ debitAccount: "1210" }), []).status, "unclassified");
  const r = rule({ ruleType: "account_exact", debitAccountPattern: "9999" });
  assert.equal(classifyTransaction(tx({ debitAccount: "1210" }), [r]).status, "unclassified");
});

test("account_exact: matches debit (and credit when set)", () => {
  const r = rule({ id: "r1", classId: "rev", ruleType: "account_exact", debitAccountPattern: "1210", creditAccountPattern: "6100" });
  const res = classifyTransaction(tx({ debitAccount: "1210", creditAccount: "6100" }), [r]);
  assert.equal(res.status, "confirmed");
  assert.equal(res.classId, "rev");
  assert.equal(res.matchedRuleId, "r1");
  // credit mismatch -> no match
  assert.equal(classifyTransaction(tx({ debitAccount: "1210", creditAccount: "7700" }), [r]).status, "unclassified");
});

test("account_pair outranks description_contains", () => {
  const pair = rule({ id: "pair", classId: "A", ruleType: "account_pair", debitAccountPattern: "1210", creditAccountPattern: "6100" });
  const desc = rule({ id: "desc", classId: "B", ruleType: "description_contains", descriptionPattern: "sale" });
  const res = classifyTransaction(
    tx({ debitAccount: "1210", creditAccount: "6100", description: "Land sale" }),
    [desc, pair],
  );
  assert.equal(res.classId, "A");
  assert.equal(res.matchedRuleId, "pair");
});

test("priority tie with different classes -> needs_review (suggested)", () => {
  const a = rule({ id: "a", classId: "A", ruleType: "account_exact", debitAccountPattern: "1210", priority: 10 });
  const b = rule({ id: "b", classId: "B", ruleType: "account_exact", creditAccountPattern: "6100", priority: 10 });
  const res = classifyTransaction(tx({ debitAccount: "1210", creditAccount: "6100" }), [a, b]);
  assert.equal(res.status, "suggested");
  assert.equal(res.classId, null);
});

test("same priority, same class -> classified (not a conflict)", () => {
  const a = rule({ id: "a", classId: "A", ruleType: "account_exact", debitAccountPattern: "1210", priority: 10 });
  const b = rule({ id: "b", classId: "A", ruleType: "account_exact", creditAccountPattern: "6100", priority: 10 });
  const res = classifyTransaction(tx({ debitAccount: "1210", creditAccount: "6100" }), [a, b]);
  assert.equal(res.status, "confirmed");
  assert.equal(res.classId, "A");
});

test("Georgian description_contains matches", () => {
  const r = rule({ id: "g", classId: "geo", ruleType: "description_contains", descriptionPattern: "მიწის ნაკვეთის" });
  const res = classifyTransaction(tx({ description: "  მიწის   ნაკვეთის   გაყიდვა " }), [r]);
  assert.equal(res.status, "confirmed");
  assert.equal(res.classId, "geo");
});

test("shared filters: currency/amount band exclude non-matching rows", () => {
  const r = rule({ id: "usd", classId: "fx", ruleType: "amount_direction", currency: "USD", minAmount: 50 });
  assert.equal(classifyTransaction(tx({ currency: "USD", originalAmount: 100 }), [r]).classId, "fx");
  assert.equal(classifyTransaction(tx({ currency: "GEL", originalAmount: 100 }), [r]).status, "unclassified");
  assert.equal(classifyTransaction(tx({ currency: "USD", originalAmount: 10 }), [r]).status, "unclassified");
});

test("inactive rules are ignored", () => {
  const r = rule({ id: "off", classId: "x", ruleType: "account_exact", debitAccountPattern: "1210", isActive: false });
  assert.equal(classifyTransaction(tx({ debitAccount: "1210" }), [r]).status, "unclassified");
});

test("ruleMatchesTx: preview matcher mirrors engine matching (incl. inactive)", () => {
  const active = rule({ ruleType: "account_pair", debitAccountPattern: "1210", creditAccountPattern: "6100" });
  const inactive = rule({ ...active, isActive: false });
  const t = tx({ debitAccount: "1210", creditAccount: "6100" });
  assert.equal(ruleMatchesTx(t, active), true);
  assert.equal(ruleMatchesTx(t, inactive), false);
  assert.equal(ruleMatchesTx(tx({ debitAccount: "1210", creditAccount: "9999" }), active), false);
});

test("lower numeric priority wins among same rule type", () => {
  const lo = rule({ id: "lo", classId: "LO", ruleType: "account_exact", debitAccountPattern: "1210", priority: 5 });
  const hi = rule({ id: "hi", classId: "HI", ruleType: "account_exact", debitAccountPattern: "1210", priority: 50 });
  const res = classifyTransaction(tx({ debitAccount: "1210" }), [hi, lo]);
  assert.equal(res.classId, "LO");
  assert.equal(res.matchedRuleId, "lo");
});
