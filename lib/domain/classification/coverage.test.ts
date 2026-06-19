import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCoverage, topUnmatchedPairs, rerunStatuses } from "./coverage.ts";

test("summarizeCoverage: counts by status/source and coverage %", () => {
  const c = summarizeCoverage([
    { status: "confirmed", source: "manual" },
    { status: "confirmed", source: "rule" },
    { status: "confirmed", source: "rule" },
    { status: "confirmed", source: "rule" },
    { status: "unclassified", source: null },
    { status: "unclassified", source: null },
    { status: "unclassified", source: null },
    { status: "unclassified", source: null },
  ]);
  assert.equal(c.total, 8);
  assert.equal(c.confirmedManual, 1);
  assert.equal(c.confirmedRule, 3);
  assert.equal(c.unclassified, 4);
  assert.equal(c.coveragePct, 50);
});

test("summarizeCoverage: empty -> 0% (no divide by zero)", () => {
  assert.equal(summarizeCoverage([]).coveragePct, 0);
});

test("topUnmatchedPairs: ranks unresolved pairs only", () => {
  const top = topUnmatchedPairs([
    { status: "unclassified", debit: "1210", credit: "6200" },
    { status: "unclassified", debit: "1210", credit: "6200" },
    { status: "unclassified", debit: "7700", credit: "1210" },
    { status: "confirmed", debit: "1210", credit: "6100" }, // excluded (resolved)
  ]);
  assert.equal(top[0].pair, "1210 / 6200");
  assert.equal(top[0].count, 2);
  assert.ok(!top.some((p) => p.pair === "1210 / 6100"));
});

test("rerunStatuses: reflects options; confirmed only when overwrite", () => {
  assert.deepEqual(
    rerunStatuses({ includeUnclassified: true, includeSuggested: true, overwriteRuleConfirmed: false }),
    ["unclassified", "suggested"],
  );
  assert.deepEqual(
    rerunStatuses({ includeUnclassified: true, includeSuggested: false, overwriteRuleConfirmed: true }),
    ["unclassified", "confirmed"],
  );
  assert.deepEqual(
    rerunStatuses({ includeUnclassified: false, includeSuggested: false, overwriteRuleConfirmed: false }),
    [],
  );
});
