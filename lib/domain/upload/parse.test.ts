import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAccountingNumber,
  classifyFxStatus,
  dateWithinSelected,
  detectPeriodMismatch,
  validateUploadFile,
  hasBlockingIssue,
  parseAccountingDate,
  parseCurrency,
} from "./parse.ts";

test("parseAccountingNumber: plain, thousands, decimals", () => {
  assert.equal(parseAccountingNumber("1250"), 1250);
  assert.equal(parseAccountingNumber("1,250"), 1250);
  assert.equal(parseAccountingNumber("1,250.50"), 1250.5);
  assert.equal(parseAccountingNumber(1250.5), 1250.5);
});

test("parseAccountingNumber: accounting parentheses are negative", () => {
  assert.equal(parseAccountingNumber("(1,250)"), -1250);
  assert.equal(parseAccountingNumber("(1,250.50)"), -1250.5);
  assert.equal(parseAccountingNumber("-1250"), -1250);
});

test("parseAccountingNumber: currency symbols and spaces stripped", () => {
  assert.equal(parseAccountingNumber("₾ 1,250.00"), 1250);
  assert.equal(parseAccountingNumber("$1,250"), 1250);
});

test("parseAccountingNumber: blanks and junk -> null", () => {
  assert.equal(parseAccountingNumber(""), null);
  assert.equal(parseAccountingNumber("-"), null);
  assert.equal(parseAccountingNumber("  "), null);
  assert.equal(parseAccountingNumber("abc"), null);
  assert.equal(parseAccountingNumber(null), null);
  assert.equal(parseAccountingNumber(undefined), null);
});

test("classifyFxStatus: base currency needs no FX; others pending; unknown pending", () => {
  assert.equal(classifyFxStatus("GEL", "GEL"), "not_required");
  assert.equal(classifyFxStatus("USD", "GEL"), "pending");
  assert.equal(classifyFxStatus(null, "GEL"), "pending");
});

test("dateWithinSelected: inclusive range", () => {
  assert.equal(dateWithinSelected("2026-06-15", "2026-06-01", "2026-06-30"), true);
  assert.equal(dateWithinSelected("2026-06-01", "2026-06-01", "2026-06-30"), true);
  assert.equal(dateWithinSelected("2026-07-01", "2026-06-01", "2026-06-30"), false);
});

test("detectPeriodMismatch: only when detected falls outside selected", () => {
  const sel = { start: "2026-06-01", end: "2026-06-30" };
  assert.equal(detectPeriodMismatch(sel, { start: "2026-06-05", end: "2026-06-20" }), false);
  assert.equal(detectPeriodMismatch(sel, { start: "2026-05-28", end: "2026-06-20" }), true);
  assert.equal(detectPeriodMismatch(sel, { start: "2026-06-05", end: "2026-07-02" }), true);
  assert.equal(detectPeriodMismatch(null, { start: "2026-06-05", end: "2026-07-02" }), false);
});

test("validateUploadFile: extension, empty, size", () => {
  assert.deepEqual(validateUploadFile({ filename: "june.xlsx", size: 1000 }), []);
  assert.equal(
    validateUploadFile({ filename: "june.csv", size: 1000 }).some((i) => i.code === "BAD_EXTENSION"),
    true,
  );
  assert.equal(
    validateUploadFile({ filename: "june.xlsx", size: 0 }).some((i) => i.code === "EMPTY_FILE"),
    true,
  );
  assert.equal(
    validateUploadFile({ filename: "june.xlsx", size: 99 * 1024 * 1024 }).some((i) => i.code === "TOO_LARGE"),
    true,
  );
});

test("hasBlockingIssue: errors block, warnings do not", () => {
  assert.equal(hasBlockingIssue([{ severity: "warning", code: "X", message: "" }]), false);
  assert.equal(hasBlockingIssue([{ severity: "error", code: "X", message: "" }]), true);
});

test("parseAccountingDate: ISO, European/Georgian, Date, Excel serial", () => {
  assert.equal(parseAccountingDate("2026-06-13"), "2026-06-13");
  assert.equal(parseAccountingDate("13/06/2026"), "2026-06-13"); // day-first
  assert.equal(parseAccountingDate("13.06.2026"), "2026-06-13"); // Georgian dot
  assert.equal(parseAccountingDate("06/13/2026"), "2026-06-13"); // first part > 12 -> mm/dd
  assert.equal(parseAccountingDate(new Date(Date.UTC(2026, 5, 13))), "2026-06-13");
  assert.equal(parseAccountingDate(46186), "2026-06-13"); // Excel serial for 2026-06-13
});

test("parseAccountingDate: blanks and junk -> null", () => {
  assert.equal(parseAccountingDate(""), null);
  assert.equal(parseAccountingDate(null), null);
  assert.equal(parseAccountingDate("not a date"), null);
  assert.equal(parseAccountingDate("2026-13-40"), null); // invalid month/day
});

test("parseCurrency: maps known symbols/codes, else null", () => {
  assert.equal(parseCurrency("GEL"), "GEL");
  assert.equal(parseCurrency("₾"), "GEL");
  assert.equal(parseCurrency("usd"), "USD");
  assert.equal(parseCurrency("$"), "USD");
  assert.equal(parseCurrency("EUR"), "EUR");
  assert.equal(parseCurrency("€"), "EUR");
  assert.equal(parseCurrency("GBP"), null);
  assert.equal(parseCurrency(""), null);
  assert.equal(parseCurrency(null), null);
});
