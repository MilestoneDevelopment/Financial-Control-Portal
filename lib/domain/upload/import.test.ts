import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImport } from "./import.ts";

test("buildImport: happy path GEL rows, skips blank rows", () => {
  const r = buildImport({
    headers: ["Date", "Description", "Debit account", "Credit account", "Amount", "Currency"],
    rows: [
      ["2026-06-13", "Land sale", "1210", "6100", "1,250.50", "GEL"],
      ["", "", "", "", "", ""], // blank -> skipped
      ["13.06.2026", "Fee", "7700", "1210", "(200)", "GEL"],
    ],
    baseCurrency: "GEL",
    selected: null,
  });
  assert.equal(r.blocked, false);
  assert.equal(r.rowCount, 2);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].transactionDate, "2026-06-13");
  assert.equal(r.rows[0].originalAmount, 1250.5);
  assert.equal(r.rows[0].originalCurrency, "GEL");
  assert.equal(r.rows[0].fxStatus, "not_required");
  assert.equal(r.rows[0].amountGel, 1250.5);
  assert.equal(r.rows[1].originalAmount, -200);
  assert.equal(r.detectedStart, "2026-06-13");
  assert.equal(r.detectedEnd, "2026-06-13");
  assert.equal(r.validationStatus, "passed");
});

test("buildImport: missing required Date column blocks import", () => {
  const r = buildImport({
    headers: ["Description", "Amount"],
    rows: [["x", "100"]],
    baseCurrency: "GEL",
    selected: null,
  });
  assert.equal(r.blocked, true);
  assert.equal(r.rows.length, 0);
  assert.equal(r.validationStatus, "failed");
  assert.ok(r.issues.some((i) => i.code === "MISSING_COLUMN"));
});

test("buildImport: foreign currency with rate -> resolved + amount_gel", () => {
  const r = buildImport({
    headers: ["Date", "Amount", "Currency", "FX rate"],
    rows: [["2026-06-13", "100", "USD", "2.7"]],
    baseCurrency: "GEL",
    selected: null,
  });
  const row = r.rows[0];
  assert.equal(row.fxStatus, "resolved");
  assert.equal(row.fxRateToGel, 2.7);
  assert.equal(row.fxRateSource, "imported");
  assert.equal(row.amountGel, 270);
});

test("buildImport: foreign currency without rate -> pending + MISSING_FX, no amount_gel", () => {
  const r = buildImport({
    headers: ["Date", "Amount", "Currency"],
    rows: [["2026-06-13", "100", "USD"]],
    baseCurrency: "GEL",
    selected: null,
  });
  assert.equal(r.rows[0].fxStatus, "pending");
  assert.equal(r.rows[0].amountGel, null);
  assert.ok(r.issues.some((i) => i.code === "MISSING_FX"));
  assert.equal(r.validationStatus, "warnings");
});

test("buildImport: detected period outside selected -> PERIOD_MISMATCH warning", () => {
  const r = buildImport({
    headers: ["Date", "Amount"],
    rows: [["2026-07-05", "100"]],
    baseCurrency: "GEL",
    selected: { start: "2026-06-01", end: "2026-06-30" },
  });
  assert.ok(r.issues.some((i) => i.code === "PERIOD_MISMATCH"));
  assert.equal(r.validationStatus, "warnings");
});

test("buildImport: bad date and amount raise row issues but keep the row", () => {
  const r = buildImport({
    headers: ["Date", "Amount"],
    rows: [["notadate", "abc"]],
    baseCurrency: "GEL",
    selected: null,
  });
  assert.equal(r.rowCount, 1);
  assert.equal(r.rows[0].transactionDate, null);
  assert.equal(r.rows[0].originalAmount, null);
  assert.ok(r.issues.some((i) => i.code === "BAD_DATE" && i.rowIndex === 1));
  assert.ok(r.issues.some((i) => i.code === "BAD_AMOUNT" && i.rowIndex === 1));
});

test("buildImport: no currency column assumes base currency (no FX issue)", () => {
  const r = buildImport({
    headers: ["Date", "Amount"],
    rows: [["2026-06-13", "500"]],
    baseCurrency: "GEL",
    selected: null,
  });
  assert.equal(r.rows[0].originalCurrency, "GEL");
  assert.equal(r.rows[0].fxStatus, "not_required");
  assert.equal(r.rows[0].amountGel, 500);
  assert.ok(!r.issues.some((i) => i.code === "MISSING_FX"));
});
