import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFilterParams, hasAnyFilter, matchesSearch, EMPTY_FILTERS } from "./filters.ts";

test("buildFilterParams: only non-empty filters become params", () => {
  assert.deepEqual(buildFilterParams(EMPTY_FILTERS), {});
  assert.deepEqual(
    buildFilterParams({ ...EMPTY_FILTERS, status: "unclassified", search: "local" }),
    { status: "unclassified", search: "local" },
  );
});

test("buildFilterParams: reset (EMPTY_FILTERS) yields a clean URL (no params)", () => {
  assert.equal(Object.keys(buildFilterParams(EMPTY_FILTERS)).length, 0);
});

test("hasAnyFilter", () => {
  assert.equal(hasAnyFilter(EMPTY_FILTERS), false);
  assert.equal(hasAnyFilter({ ...EMPTY_FILTERS, currency: "USD" }), true);
});

test("matchesSearch: empty query matches all; case-insensitive substring", () => {
  assert.equal(matchesSearch(["Local GEL sale", "1210", "6100"], ""), true);
  assert.equal(matchesSearch(["Local GEL sale", "1210", "6100"], "local"), true);
  assert.equal(matchesSearch(["Local GEL sale", "1210", "6100"], "6100"), true);
  assert.equal(matchesSearch(["Local GEL sale", "1210", "6100"], "salary"), false);
  assert.equal(matchesSearch([null, null, null], "x"), false);
});

test("matchesSearch: Georgian substring", () => {
  assert.equal(matchesSearch(["მიწის ნაკვეთის გაყიდვა", null, null], "ნაკვეთ"), true);
});
