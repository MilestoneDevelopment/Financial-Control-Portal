import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  isPeriodMutable,
  requirePeriodMutable,
  periodLabel,
} from "./lifecycle.ts";

test("canTransition: follows the lifecycle order", () => {
  assert.equal(canTransition("draft", "active"), true);
  assert.equal(canTransition("active", "locked"), true);
  assert.equal(canTransition("locked", "closed"), true);
  assert.equal(canTransition("closed", "archived"), true);
  // not allowed
  assert.equal(canTransition("draft", "closed"), false);
  assert.equal(canTransition("archived", "active"), false);
});

test("isPeriodMutable: draft/active mutable; locked/closed only with correction mode", () => {
  assert.equal(isPeriodMutable({ status: "draft", is_correction_mode: false }), true);
  assert.equal(isPeriodMutable({ status: "active", is_correction_mode: false }), true);
  assert.equal(isPeriodMutable({ status: "locked", is_correction_mode: false }), false);
  assert.equal(isPeriodMutable({ status: "locked", is_correction_mode: true }), true);
  assert.equal(isPeriodMutable({ status: "closed", is_correction_mode: true }), true);
  assert.equal(isPeriodMutable({ status: "archived", is_correction_mode: true }), false);
});

test("requirePeriodMutable: throws on locked without correction mode", () => {
  assert.throws(() => requirePeriodMutable({ status: "locked", is_correction_mode: false }));
  assert.doesNotThrow(() => requirePeriodMutable({ status: "draft", is_correction_mode: false }));
});

test("periodLabel: month + year, or year only", () => {
  assert.equal(periodLabel({ year: 2026, month: 6 }), "Jun 2026");
  assert.equal(periodLabel({ year: 2025, month: null }), "2025");
});
