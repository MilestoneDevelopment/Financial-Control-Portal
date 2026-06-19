import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRowFx, fxSourceForDate } from "./fx-resolve.ts";

test("resolveRowFx: base currency needs no FX", () => {
  const r = resolveRowFx({ currency: "GEL", originalAmount: 1250.5, baseCurrency: "GEL", found: null });
  assert.equal(r.fxStatus, "not_required");
  assert.equal(r.amountGel, 1250.5);
  assert.equal(r.resolved, true);
  assert.equal(r.issue, null);
});

test("resolveRowFx: foreign with found rate resolves and computes amount_gel", () => {
  const r = resolveRowFx({
    currency: "USD",
    originalAmount: 100,
    baseCurrency: "GEL",
    found: { rate: 2.7, date: "2026-06-25", source: "nbg" },
  });
  assert.equal(r.fxStatus, "resolved");
  assert.equal(r.fxRateToGel, 2.7);
  assert.equal(r.fxRateSource, "nbg");
  assert.equal(r.fxRateDate, "2026-06-25");
  assert.equal(r.amountGel, 270);
  assert.equal(r.resolved, true);
});

test("resolveRowFx: foreign without rate stays pending + MISSING_FX", () => {
  const r = resolveRowFx({ currency: "USD", originalAmount: 100, baseCurrency: "GEL", found: null });
  assert.equal(r.fxStatus, "pending");
  assert.equal(r.amountGel, null);
  assert.equal(r.resolved, false);
  assert.equal(r.issue?.code, "MISSING_FX");
});

test("resolveRowFx: unknown currency -> pending + BAD_CURRENCY", () => {
  const r = resolveRowFx({ currency: null, originalAmount: 100, baseCurrency: "GEL", found: null });
  assert.equal(r.fxStatus, "pending");
  assert.equal(r.resolved, false);
  assert.equal(r.issue?.code, "BAD_CURRENCY");
});

test("resolveRowFx: amount null but rate present -> resolved with null amount_gel", () => {
  const r = resolveRowFx({
    currency: "EUR",
    originalAmount: null,
    baseCurrency: "GEL",
    found: { rate: 3.0, date: "2026-06-25", source: "nbg" },
  });
  assert.equal(r.fxStatus, "resolved");
  assert.equal(r.amountGel, null);
});

test("fxSourceForDate: same date keeps base, earlier date -> nbg_prior_filled", () => {
  assert.equal(fxSourceForDate("2026-06-25", "2026-06-25", "nbg"), "nbg");
  assert.equal(fxSourceForDate("2026-06-25", "2026-06-24", "nbg"), "nbg_prior_filled");
});
