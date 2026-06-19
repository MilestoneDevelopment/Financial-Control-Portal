import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRuleInput, type RuleInput } from "./rules.ts";

function base(p: Partial<RuleInput>): RuleInput {
  return {
    classId: "class-1",
    name: "Rule",
    ruleType: "account_pair",
    priority: 100,
    confidenceScore: 0.9,
    isActive: true,
    debitAccountPattern: null,
    creditAccountPattern: null,
    descriptionPattern: null,
    currency: null,
    minAmount: null,
    maxAmount: null,
    cashDirection: null,
    ...p,
  };
}

test("valid account_pair passes and trims patterns", () => {
  const r = validateRuleInput(base({ debitAccountPattern: " 1210 ", creditAccountPattern: " 6100 " }));
  assert.equal(r.ok, true);
  assert.equal(r.cleaned.debitAccountPattern, "1210");
  assert.equal(r.cleaned.creditAccountPattern, "6100");
});

test("account_pair requires both accounts", () => {
  const r = validateRuleInput(base({ debitAccountPattern: "1210", creditAccountPattern: null }));
  assert.equal(r.ok, false);
});

test("missing class / name rejected", () => {
  assert.equal(validateRuleInput(base({ classId: "", debitAccountPattern: "1", creditAccountPattern: "2" })).ok, false);
  assert.equal(validateRuleInput(base({ name: "  ", debitAccountPattern: "1", creditAccountPattern: "2" })).ok, false);
});

test("confidence must be 0..1, priority integer", () => {
  assert.equal(validateRuleInput(base({ confidenceScore: 1.5, debitAccountPattern: "1", creditAccountPattern: "2" })).ok, false);
  assert.equal(validateRuleInput(base({ priority: 1.5, debitAccountPattern: "1", creditAccountPattern: "2" })).ok, false);
});

test("empty broad amount_direction rejected; constrained one passes", () => {
  assert.equal(validateRuleInput(base({ ruleType: "amount_direction" })).ok, false);
  assert.equal(validateRuleInput(base({ ruleType: "amount_direction", cashDirection: "neutral" })).ok, false); // neutral != constraint
  assert.equal(validateRuleInput(base({ ruleType: "amount_direction", currency: "USD" })).ok, true);
  assert.equal(validateRuleInput(base({ ruleType: "amount_direction", cashDirection: "in" })).ok, true);
});

test("description_regex validates the pattern", () => {
  assert.equal(validateRuleInput(base({ ruleType: "description_regex", descriptionPattern: "sale.*" })).ok, true);
  assert.equal(validateRuleInput(base({ ruleType: "description_regex", descriptionPattern: "(" })).ok, false);
});

test("min cannot exceed max", () => {
  const r = validateRuleInput(base({ ruleType: "amount_direction", minAmount: 100, maxAmount: 50 }));
  assert.equal(r.ok, false);
});

test("combined needs at least one condition", () => {
  assert.equal(validateRuleInput(base({ ruleType: "combined" })).ok, false);
  assert.equal(validateRuleInput(base({ ruleType: "combined", descriptionPattern: "fee" })).ok, true);
});
