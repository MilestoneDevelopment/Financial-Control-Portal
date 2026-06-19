import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNbgRate } from "./nbg.ts";

const sample = [
  {
    date: "2026-06-25T00:00:00.000Z",
    currencies: [
      { code: "USD", quantity: 1, rate: 2.7, validFromDate: "2026-06-25T00:00:00.000Z" },
      { code: "EUR", quantity: 1, rate: 3.0, validFromDate: "2026-06-25T00:00:00.000Z" },
      { code: "JPY", quantity: 100, rate: 1.8, validFromDate: "2026-06-25T00:00:00.000Z" },
    ],
  },
];

test("parseNbgRate: reads per-unit rate and date", () => {
  assert.deepEqual(parseNbgRate(sample, "USD"), { rate: 2.7, date: "2026-06-25" });
  assert.deepEqual(parseNbgRate(sample, "usd"), { rate: 2.7, date: "2026-06-25" }); // case-insensitive
});

test("parseNbgRate: divides by quantity", () => {
  assert.deepEqual(parseNbgRate(sample, "JPY"), { rate: 0.018, date: "2026-06-25" });
});

test("parseNbgRate: missing currency / bad input -> null", () => {
  assert.equal(parseNbgRate(sample, "GBP"), null);
  assert.equal(parseNbgRate([], "USD"), null);
  assert.equal(parseNbgRate(null, "USD"), null);
  assert.equal(parseNbgRate([{ currencies: [{ code: "USD", rate: 0 }] }], "USD"), null);
});
