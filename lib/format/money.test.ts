import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAmount, formatMoney } from "./money.ts";
import { formatPercent } from "./percent.ts";

test("formatAmount: positive with thousands separator", () => {
  assert.equal(formatAmount(1250), "1,250");
  assert.equal(formatAmount(5482150), "5,482,150");
});

test("formatAmount: negatives use accounting parentheses, never a minus", () => {
  assert.equal(formatAmount(-1250), "(1,250)");
  assert.equal(formatAmount(-4128760), "(4,128,760)");
  assert.ok(!formatAmount(-1250).includes("-"));
});

test("formatAmount: zero has no sign or parentheses", () => {
  assert.equal(formatAmount(0), "0");
  assert.equal(formatAmount(-0), "0");
});

test("formatAmount: decimals", () => {
  assert.equal(formatAmount(-1250.5, { decimals: 2 }), "(1,250.50)");
});

test("formatMoney: symbol is opt-in and sits outside the parentheses", () => {
  assert.equal(formatMoney(-1250, "GEL"), "(1,250)");
  assert.equal(formatMoney(-1250, "GEL", { symbol: true }), "₾(1,250)");
  assert.equal(formatMoney(1250, "USD", { symbol: true }), "$1,250");
});

test("formatPercent: sign rules", () => {
  assert.equal(formatPercent(5.2), "+5.2%");
  assert.equal(formatPercent(-5.2), "(5.2%)");
  assert.equal(formatPercent(0), "0.0%");
});
