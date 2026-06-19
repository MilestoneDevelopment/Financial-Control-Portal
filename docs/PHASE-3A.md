# Phase 3A - Transaction classification engine foundation

Branch: `phase-3a-classification-engine-foundation` (off `phase-2d-...`). Scope:
classify normalized, FX-resolved transactions into active cf_nodes class nodes via
a deterministic, company-scoped rule engine. **No** cash-flow generation, reports,
forecast, or AI/LLM.

## Implemented

- **Migration 0010** (`classification_engine`): `classification_rules` table;
  transaction metadata columns `classification_source`, `classification_confidence`,
  `classified_at`, `classified_by`, `matched_rule_id`; two enums
  (`classification_source`, `classification_rule_type`); RLS + grants; broadened
  `tx_update` policy to also allow `classification.assign`; three new capabilities.
  `db/types.ts` updated. Reuses `tx_classification_status` (**confirmed = classified,
  suggested = needs_review, unclassified = none**) to avoid enum churn.
- **Rule model** (`classification_rules`): company- and org-scoped, `class_id` →
  cf_nodes, `rule_type` (account_exact / account_pair / description_contains /
  description_regex / amount_direction / combined), account/description patterns,
  currency + amount band + cash_direction filters, `priority`, `confidence_score`,
  `is_active`, audit columns. RLS: company-scoped read; writes gated by
  `classification.manage_rules`.
- **Engine** (`lib/domain/classification/engine.ts`, pure/tested): priority
  combined > account_pair > account_exact > description > amount_direction, then by
  numeric `priority`. One unambiguous best match → `confirmed` (class + confidence +
  matched rule); best-priority rules disagreeing on class → `suggested` (needs
  review, no class); none → `unclassified`. Never guesses. Shared currency/amount/
  direction filters apply to any rule type.
- **Georgian-aware normalization** (`normalize.ts`, tested): trim, lower-case
  (no-op for caseless Georgian), collapse whitespace; no transliteration. Tests
  include Georgian descriptions.
- **Capabilities**: `classification.run` (lvl 2), `classification.assign` (lvl 2),
  `classification.manage_rules` (lvl 3). Owner holds all via the auth_can level
  fallback; new orgs get explicit role_permissions through seed_org_defaults.
- **Manual review UI** (`/c/[companyId]/classification`): filters (file / status /
  currency / date range / search); table with date, description, Dr/Cr, amount +
  currency, amount_gel, status badge, per-row class dropdown; bulk select + assign;
  Run classification button; optional "save rule" from a row (account-pair rule).
- **Server actions**: `assignClassAction`, `bulkAssignClassAction` (manual →
  `confirmed` + `classification_source = manual`, validated against the active
  structure, audited), `runClassificationAction` (rule engine over unclassified /
  needs-review rows that are **not** manual; audits processed/classified/
  needsReview/unclassified), `createRuleFromTransactionAction` (optional).

## Engine behavior

`runClassificationAction` loads active rules + targets transactions where
`classification_status in (unclassified, suggested)` and `classification_source`
is null or `rule` (so **manual classifications are never overwritten**). Each row
is run through `classifyTransaction`; results write `class_id`,
`classification_status`, `classification_source = rule` (when classified),
`classification_confidence`, `matched_rule_id`. Optional `fileId` scopes the run.

## Manual classification behavior

Assigning a class validates the class is an active `class` node in the company's
active structure version, then sets `class_id`, status `confirmed`, source
`manual`, confidence 1, `classified_by`/`classified_at`, clears `matched_rule_id`.
Audited (`classification.assigned`). Bulk assign applies to selected ids.

## Supabase / security verification

`classification_rules` RLS enabled (2 policies); `authenticated`
SELECT/INSERT/UPDATE/DELETE (RLS-gated); **no anon grants; no service_role DML**;
3 capabilities seeded; RLS on all tables. Security advisor unchanged from the 2D
baseline (no new warnings, no ERROR/critical).

## Tests / typecheck / build

`npm test` 65/65 · `npm run typecheck` clean · `npm run build` success (15 routes).

## Known limitations

- Status reuse: classified→`confirmed`, needs_review→`suggested` (documented; no
  enum change). `rejected` remains reserved/unused.
- Rule management is via "save rule" from a row only (account-pair); a full rule
  editor/CRUD UI is deferred.
- `description_regex` uses user-supplied patterns (case-insensitive, try/caught);
  no ReDoS guard yet - acceptable for trusted internal users.
- No re-run/overwrite of manual classifications by design.
- The sample company has a single class node, so multi-class conflict scenarios
  are covered by unit tests rather than live data.

## Recommended next phase

- **Phase 3B**: full rule-management UI (create/edit/disable/prioritize rules,
  preview matches), bulk re-run with overwrite option, classification coverage
  summary.
- **Phase 4**: cash-flow generation consuming classified transactions
  (class → section/group roll-up, direction-aware, period-scoped).
