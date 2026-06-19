# Phase 3B - Classification rule management, preview, coverage & safer re-run

Branch: `phase-3b-classification-rule-management` (off `phase-3a-...`). Scope: make
classification rules operationally usable. **No schema migration** (the 0010 model
already covers it); all changes are app/logic-level. No cash-flow/reports/forecast/AI.

## Implemented

- **Rule management UI** (`/c/[companyId]/classification/rules`): list all rules
  (active + inactive) with class, type, priority, confidence, account/description
  patterns, updated date; create / edit / enable / disable / delete; capability-
  gated (`classification.manage_rules`).
- **Create/edit form**: account_pair, account_exact, description_contains,
  description_regex, amount_direction, combined; class/type/priority/confidence +
  account/description/currency/amount/direction fields. Validated by the pure
  `validateRuleInput` (required fields per type, confidence 0-1, integer priority,
  trimmed patterns, regex validity, min≤max, **broad/empty rules rejected**).
- **Match preview** (`previewRuleAction`, read-only): shows which current
  unresolved transactions a (possibly unsaved) rule would match - date, description,
  Dr/Cr, amount, status, and a match flag. Mutates nothing; company-scoped; defaults
  to unclassified/suggested rows.
- **Coverage summary** (top of the classification page): coverage %, total, manual,
  by-rule, needs-review, unclassified, FX pending, active rules, and top unmatched
  account pairs - pure `summarizeCoverage` / `topUnmatchedPairs`.
- **Safer re-run controls**: checkboxes for Unclassified / Needs review / Overwrite
  rule-based; **manual classifications are never overwritten** (enforced by the
  source filter, not just the UI); a confirm dialog guards the overwrite option;
  `classification.run` audit details now include the options used.
- **Suggested/conflict visibility**: `suggested` rows render as "Needs review" with
  a distinct badge in the review table and are selectable in the re-run scope.

## Rule management behavior

`createRuleAction` / `updateRuleAction` validate via `validateRuleInput` and assert
the target class is an active class node in the company's current structure.
`setRuleActiveAction` toggles `is_active` (inactive rules are ignored by the
engine). `deleteRuleAction` detaches `matched_rule_id` from any classified rows
(keeping them classified) then deletes the rule. All audited.

## Re-run controls behavior

`runClassificationAction({ includeUnclassified, includeSuggested,
overwriteRuleConfirmed })` → `rerunStatuses` builds the target status set; the query
adds `classification_source is null OR = 'rule'`, so **manual rows are excluded even
when `confirmed` is targeted** for rule-overwrite. Defaults: unclassified + suggested,
no overwrite.

## Tests / typecheck / build

`npm test` **79/79** (14 new: rule validation, coverage/top-unmatched, rerun-status
planning, preview matcher, numeric-priority order) · `npm run typecheck` clean ·
`npm run build` success (16 routes).

## Supabase / security verification

**No DDL this phase.** `classification_rules` RLS on (2 company-scoped policies);
**no anon DML; no service_role DML**; RLS on all tables. Security advisor unchanged
from the 3A baseline (no new warnings).

## Known limitations

- Preview is capped at 500 rows and previews unresolved rows by default (an
  include-classified toggle exists in the action but isn't surfaced in the UI yet).
- Rule editing is single-rule; no bulk priority drag-reorder (priority is a numeric
  field).
- `description_regex` still runs user patterns without a ReDoS guard (trusted
  internal users).
- Delete is permanent (rows keep their class but lose the rule link); prefer Disable
  to retain the rule.

## Recommended next phase

- **Phase 4: cash-flow generation** over classified transactions (class →
  group/section roll-up, direction-aware, period-scoped), producing the cash-flow
  statement the dashboard/reports will consume.
