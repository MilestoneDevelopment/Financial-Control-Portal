import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText, normalizeAccount } from "./normalize.ts";

test("normalizeText: trims, lowercases Latin, collapses spaces", () => {
  assert.equal(normalizeText("  Land   Plot   SALE "), "land plot sale");
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeText(undefined), "");
});

test("normalizeText: preserves Georgian (caseless), still collapses spaces", () => {
  // Georgian has no case; text is preserved, spacing normalized.
  assert.equal(normalizeText("  მიწის   ნაკვეთის   გაყიდვა "), "მიწის ნაკვეთის გაყიდვა");
});

test("normalizeAccount: trims only", () => {
  assert.equal(normalizeAccount("  1210 "), "1210");
  assert.equal(normalizeAccount(null), "");
});
