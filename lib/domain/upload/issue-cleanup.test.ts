import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeIssues,
  activeIssueCount,
  missingFxIssuesToClear,
  shouldRevertSupersede,
} from "./issue-cleanup.ts";

const issues = [
  { id: "a", code: "MISSING_FX", row_index: 2, resolved_at: null },
  { id: "b", code: "MISSING_FX", row_index: 3, resolved_at: null },
  { id: "c", code: "MISSING_FX", row_index: null, resolved_at: null }, // file-level (earlier resolve run)
  { id: "d", code: "BAD_CURRENCY", row_index: 4, resolved_at: null },
  { id: "e", code: "MISSING_FX", row_index: 5, resolved_at: "2026-06-19T00:00:00Z" }, // already resolved
];

test("activeIssues / activeIssueCount exclude resolved", () => {
  assert.equal(activeIssueCount(issues), 4);
  assert.equal(activeIssues(issues).length, 4);
  assert.ok(!activeIssues(issues).some((i) => i.id === "e"));
});

test("missingFxIssuesToClear: clears matching row indexes only (BAD_CURRENCY untouched)", () => {
  const ids = missingFxIssuesToClear(issues, [2], false);
  assert.deepEqual(ids, ["a"]);
});

test("missingFxIssuesToClear: when none pending remain, clears all unresolved MISSING_FX incl. file-level", () => {
  const ids = missingFxIssuesToClear(issues, [2, 3], true);
  assert.deepEqual(ids.sort(), ["a", "b", "c"]); // not d (BAD_CURRENCY), not e (already resolved)
});

test("missingFxIssuesToClear: never clears BAD_CURRENCY or already-resolved", () => {
  const ids = missingFxIssuesToClear(issues, [4, 5], true);
  assert.ok(!ids.includes("d"));
  assert.ok(!ids.includes("e"));
});

test("shouldRevertSupersede: only when no replacement remains", () => {
  assert.equal(shouldRevertSupersede(0), true);
  assert.equal(shouldRevertSupersede(1), false);
});
