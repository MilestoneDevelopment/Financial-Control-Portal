# Financial Control Portal - Implementation Analysis & Build Plan

> Status: **proposal for approval (rev. 2)**. No production code is written until this is signed off.
> Rev. 2 (2026-06-18) incorporates the four blocking decisions: transaction-date FX policy, per-company
> configurable base currency (GEL default, no hardcoded USD company), prior-period-closing opening balance
> chain, and **separate** accounting-period vs forecast-version lifecycles. Resolved items are marked
> **[RESOLVED]** in Section 11.
> Rev. 3 (2026-06-18) folds in the four non-blocking decisions before Phase 0: **versioned cash-flow
> structure** (Section 6b), **top-level GEL portfolio consolidation** (Section 6c), **NBG endpoint + GEL/USD/EUR
> support** (Section 8), and **data-volume / indexing** assumptions (Section 2). Git & implementation
> workflow is Section 12.
> Source of truth: the frozen prototype bundle in `_handoff/milestone-visual-identity-application/`
> (`Financial Control Portal Prototype.dc.html`, `Implementation Handoff.html`, `Component Reference - Period Selector.dc.html`).

This document is grounded in the actual prototype logic - the controller's data model, the period
engine (`periodModel` / `cfColumns` / `cfNodeVal` / `cfBalanceCells`), the classification dataset and
rule library, the forecast version lifecycle, the variance aggregations, the structure-builder tree, and
the admin console matrices - not on assumptions. Where the prototype is silent on a production decision,
it is flagged in Section 11.

---

## 0. What the prototype actually is

A single-file reactive prototype using Claude Design's DSL (`x-dc`, `sc-for`, `sc-if`, `{{ }}`) backed by
`support.js`. All "data" is hardcoded in one `Component` class. It is the **UI/product reference**, not an
architecture. The job is to reproduce its screens and rules pixel-accurately on a real Next.js + Supabase
backend, **not** to port the single-file structure.

**Ten desktop modules + a mobile read-only view**, one global sidebar, one top bar, one shared period
selector, and an account menu distinct from the Admin Console:

| Module | Core behavior in prototype |
|---|---|
| Portfolio Overview | Consolidated, read-only. Per-company rows **plus** a consolidated total (never a single grand total). Active only in All Companies mode. |
| Dashboard | Single-company KPIs, AvF & cash-in/out charts, donuts, recent tx, period status / tasks / activity rails. |
| Cash Flow | Excel-style statement. Opening -> Operating/Investing/Financing -> Net -> Closing. Expand/collapse tree, frozen first column, forecast columns tinted. Views: Summary / Detailed / Actual-vs-Forecast. |
| Upload Files | 4 steps (Select scope -> Upload -> Validate -> Confirm). 5 validation states. Locked-period + Correction-Mode gating with audited reason. |
| Classification | Queue tabs (Review Queue / Unclassified / Review Recommended / Auto-classified / FX Rate Missing) + Libraries & Rules (Class Library, Rule Library, Learning History). Confidence badges, rule learning, "Generate Actual Cash Flow". |
| Variance Analytics | KPI strip, charts, By Class/Dept/Section/Month, severity badges, row -> detail panel -> transaction preview. |
| Forecast & Budget | Grid **mirrors Cash Flow structure exactly**. Versions Draft/Active/Approved/Archived. Excel import/export, change history. Cells editable only for Draft/Active. |
| Structure Builder | Drag-drop Section/Group/Class tree (bidirectional), inspector, summary cards, validation, delete-safety, change history. Per-company; copyable between companies. |
| Reports & Export | Config -> preview (PDF doc / Excel sheets) -> download/print/archive. Archive table. Raw export permission-gated. All exports audited. |
| Admin Console | 7 tabs: Users, Roles, Company Access, Companies, Invitations, Audit Log, Security Settings. |
| Mobile read-only | Phone frame: company switcher, KPI cards, charts, section flow, report download. No editing. |

**Cross-cutting rules confirmed in code:**
- Closing = Opening + Net; Net = Operating + Investing + Financing. (`cfBalanceCells`)
- Balances are never summed as flows: opening = first month's opening, closing = last month's closing; only flows sum. (`cfBalanceCells`, `openMonth`/`openYear`)
- FY vs YTD is data-driven by `currentYear = 2026` and `latestActualMonth = 5` (June). Current incomplete year = `2026 YTD`; closed years = `FY2025`. (`periodModel`, `cfColumns`)
- Negatives use accounting parentheses globally: `(1,250)`, `(5.2%)` - never a minus. Color is independent of sign. (`fmt`, `pct`)
- GEL default, USD optional via FX rate (prototype hardcodes `rate = 0.366`); currency toggle recomputes live. (`cv`)
- Class = Cash Flow Line Item; Forecast grid is built from the *same* structure tree as Cash Flow. (`extraVals` forecast branch reuses `cashflowTree` + `cfColumns`)

---

## 1. Repository / project structure

Single Next.js app (App Router, TypeScript, React Server Components). Not a monorepo - one product, one
deploy target. Supabase is the backend (Postgres + Auth + Storage + Edge Functions).

```
financial-control-portal/
  app/
    (auth)/                      login, accept-invite, reset-password
    (app)/
      layout.tsx                 sidebar + top bar shell, period & currency providers
      portfolio/                 All Companies overview (read-only)
      c/[companyId]/             company workspace (all operational modules)
        dashboard/
        cash-flow/
        upload/
        classification/
        variance/
        forecast/
        structure/
        reports/
      admin/                     Users, Roles, Company Access, Companies, Invitations, Audit, Security
      account/                   personal settings (modals): profile, password, notifications, etc.
    m/                           mobile read-only views
    api/                         route handlers (webhooks, NBG cron target, export download)
  components/
    ui/                          design-system primitives (Button, Card, Toggle, Tabs, Modal, Toast)
    finance/                     CashFlowTable, PeriodSelector, KpiCard, VarianceBadge, CurrencyToggle
    charts/                      AvFChart, CashInOutChart, Donut, TrendLines (SVG, matching prototype geometry)
  lib/
    supabase/                    server.ts, client.ts, middleware.ts, admin.ts (service role)
    domain/
      period/                    period model: spec, factor, FY/YTD labeling (port of periodModel)
      cash-flow/                 column builder, node aggregation, balance logic (port of cfColumns/cfNodeVal/cfBalanceCells)
      classification/            rule engine, confidence tiers, learning
      forecast/                  version lifecycle, grid build, import mapping
      variance/                  aggregation, severity model
      fx/                        rate resolution (imported -> NBG -> manual), conversion policy
      reports/                   report definitions, Excel/PDF builders
      permissions/              capability keys, role -> capability map, guards
    format/                      money (accounting parentheses), percent, dates
  db/
    types.ts                     generated Supabase types
  supabase/
    migrations/                  SQL migrations (schema + RLS + policies)
    functions/
      parse-accounting-file/     Excel ingest + validation (Deno edge function)
      generate-report/           async Excel/PDF build
      nbg-fx-sync/               scheduled NBG rate pull
  styles/
    tokens.css                   design tokens (colors, type, radii) from the brand system
```

**Key structural decisions**
- **Company in the URL** (`/c/[companyId]/...`), Portfolio at `/portfolio`. This makes the active workspace
  explicit, scopes every server fetch, and aligns cleanly with RLS. A `CompanyProvider` reads the segment;
  the company switcher navigates.
- **Server Components fetch, Server Actions mutate.** No client-side data layer beyond light state
  (period selection, currency toggle, expand/collapse). Period + currency live in URL search params or a
  cookie-backed provider so they survive navigation, matching the prototype's "shared period state across pages".
- **Long-running work (Excel parse, report build, NBG sync) runs in Edge Functions**, with status surfaced
  via Supabase Realtime or polling - never blocking a request.
- The `lib/domain/*` modules are framework-agnostic and unit-testable; they are direct, faithful ports of
  the prototype's finance logic so behavior matches the frozen reference exactly.

---

## 2. Database schema proposal

Multi-tenant by `company_id`, holding-level by `org_id`, enforced with Row-Level Security on every table.
Money stored as `numeric(18,2)` in the company's base currency; presentation converts to USD on read.

**Identity & access**
- `organizations` - the holding (Milestone). One row to start; schema supports more.
- `companies` - id, org_id, name, short_code (TSV-001), **base_currency (configurable, default `GEL`; no company hardcoded to USD - set only by Admin)**, status (`draft|active|archived`), structure_source (template/copied-from/custom), in_portfolio (bool), created_at.
- `profiles` - 1:1 with `auth.users`: display name, avatar, appearance prefs, notification prefs.
- `memberships` - (user_id, company_id, role_id). **Per-company role** - a user can be CFO in one company and Viewer in another (Company Access matrix). Org-level roles (Owner/Admin) represented with a sentinel/global membership or `org_memberships`.
- `roles` - id, org_id, name, is_system (Owner/Admin/CFO/Editor/Viewer) vs custom.
- `role_permissions` - (role_id, capability_key, allowed). Capability keys mirror the prototype's grouped matrix (Section 3). Owner is implicitly all-allowed.
- `invitations` - email, role_id, company scope, invited_by, created_at, expires_at, status (`pending|accepted|expired|cancelled`).
- `security_settings` - org-scoped: invite_expiry_days, default_role, and the 8 toggles from the prototype (email verification, manual creation, force reset, no-default-access, raw-export-by-role, correction-reason-required, approval-before-activation, restrict-portfolio-roles).
- `audit_log` - append-only: actor, action, target, details, company/org context, severity (`ok|warn`), created_at. Insert-only policy; no update/delete.

**Cash-flow structure (per company, versioned)**
- `cf_structure_versions` - id, company_id, version_no, label, status (`draft|active|superseded`), created_by, created_at. Exactly one `active` version per company; editing creates/advances a draft that becomes active on save. **Closed/locked periods pin the version that was active when they were generated** (see Section 6b).
- `cf_nodes` - adjacency tree, scoped to a structure version: id, company_id, structure_version_id, parent_id, kind (`section|group|class`), label, sort_order, cash_direction (`in|out|neutral`, classes only), is_active, dept (optional analytic tag). Class = cash flow line item. Indexed by (structure_version_id, parent_id, sort_order). Drag-drop reorders `sort_order`/`parent_id` within the draft version. All structure changes are audit-logged.
- `periods.structure_version_id` - FK pinning the structure snapshot a period was generated/closed against; `forecast_versions.structure_version_id` pins the structure a forecast mirrors. (Phase 0 creates `cf_structure_versions` + the FK columns; `cf_nodes` and the Structure Builder land in Phase 1.)

**Periods & ingest**
- `periods` - company_id, year, month (nullable for quarter/year scopes), status (`draft|active|locked|closed|archived`), **opening_balance, opening_balance_source (`carried|imported|manual`), opening_balance_set_by, opening_balance_set_at** (manual entry is permissioned + audit-logged), closing_balance (snapshot on close), is_correction_mode, correction_reason, locked_by, locked_at, closed_by, closed_at. Full lifecycle in Section 6a.
- `accounting_files` - company_id, period_id, storage_path, original_name, status (`uploaded|validating|validated|committed|failed|removed|superseded`), uploaded_by, validation jsonb, replaces_file_id, is_correction (bool), correction_reason, created_at. Superseded files are **retained**, never hard-deleted, when replaced in a locked/closed period.
- `transactions` - company_id, period_id, file_id, txn_date, description, dr_account, cr_account, debit, credit, **`original_amount`, `original_currency`, `fx_rate_to_gel`, `fx_rate_source` (`imported|nbg|nbg_prior_filled|manual`), `fx_rate_date`, `amount_gel`** (normalized base, GEL by default), suggested_class_id, class_id, classification_status (`unclassified|auto|review|fx_missing|classified`), confidence, matched_rule_id, source (`auto|manual|imported`). Display currency (e.g. USD) is derived at the UI/report layer, never stored on the row. High-volume table; partition/index by (company_id, period_id).

**Classification**
- `classification_rules` - company_id, name, class_id, rule_type (`account_code|keyword|credit_analytics|combined|exact_description|fuzzy`), match_field, match_value/pattern, confidence_tier (`high|medium|low`), is_active, origin (`manual|transaction`), created_by, last_used_at, priority.
- `classification_events` - learning history: company_id, actor, event_type (rule_created | manual_assignment_saved_as_rule | suggestion_confirmed | class_added | suggestion_rejected | rule_disabled), class_id, transaction_id, details, created_at.

**Cash flow (generated) & forecast**
- `cash_flow_entries` - snapshot of generated actuals: company_id, period_id, class_id, year, month, amount. Produced by "Generate Actual Cash Flow"; for open periods may be computed live (Section 6).
- `forecast_versions` - company_id, name, status (`draft|active|approved|archived`), created_by, approved_by, approved_at. Only one `active` per company drives forecast columns elsewhere. **This lifecycle is independent of `periods.status`** - Forecast Approved != Period Locked, and the two never share a table or state column (see Section 6a).
- `forecast_entries` - version_id, class_id, year, month, amount. Mirrors structure (FK to `cf_nodes` where kind=class). Editable only when version is draft/active.
- `forecast_change_log` - version_id, actor, field, old_value, new_value, created_at.

**FX & reports**
- `fx_rates` - currency_pair (GEL/USD, GEL/EUR...), rate_date, rate, source (`nbg|imported|manual`), unique on (pair, rate_date, source).
- `reports` (archive) - company_or_portfolio context, report_type, format, period_label, storage_path, file_size, generated_by, created_at.

**RLS strategy**
- Helper `auth_company_ids()` returns the set of company_ids the current user has membership in; `auth_can(capability, company_id)` resolves role -> capability.
- Operational tables: `USING (company_id IN auth_company_ids())` for read; mutations additionally check the relevant capability and period status.
- Portfolio reads span `auth_company_ids()` filtered to `in_portfolio = true`.
- `audit_log` and approved/archived forecast and locked-period data are insert-only / read-only via policy.

**Indexing & volume** (built for thousands-to-tens-of-thousands of tx / company / month; not over-engineered
for millions, but correct from the start). Indexes: `company_id`, `period_id`, `txn_date`, `dr_account`,
`cr_account`, `class_id`, `file_id`, `classification_status` on `transactions`; `periods.status`;
`forecast_entries.version_id`; `cf_nodes(structure_version_id, parent_id, sort_order)`; `fx_rates(pair, rate_date)`.
Composite `(company_id, period_id)` on the hot `transactions` path. 2023-2025 import as locked/static actuals;
2026 is the live operating year from the selected initial month.

---

## 3. Auth & permissions model

**Auth:** Supabase Auth, email/password + invitation links. Invitations create a pending `invitations`
row; acceptance provisions `auth.users` + `profiles` + `memberships`. Security settings can require email
verification, force password reset on manual creation, and require a second-admin approval before
activation (toggles already present in the prototype).

**Permission model:** capability-based, not role-name checks. Capability keys are taken verbatim from the
prototype's grouped permission matrix:

- Dashboard & Reports: `dashboard.view`, `portfolio.view`
- Upload & Classification: `upload.file`, `upload.remove`, `upload.replace`, `classification.review`, `class.add`
- Forecast & Budget: `forecast.upload`, `forecast.edit`
- Cash Flow Structure: `structure.edit`
- Period Approval & Correction: `period.approve_lock`, `period.correction_mode`, `period.set_opening_balance`
- Export: `export.excel`, `export.pdf`, `export.raw`
- Admin Settings: `users.manage`, `roles.manage`, `audit.view`
- Company Management: `companies.manage`, `companies.add`, `companies.edit`, `companies.archive`, `access.assign`

System roles map to defaults matching the handoff's permission table (Owner all; Admin all admin/company; CFO operational + approve + raw export; Editor upload/classify/forecast, no approvals/admin/raw; Viewer read + standard export only). Custom roles store explicit grants in `role_permissions`. **Owner is always all-on and locked** (prototype: `defaultPerm` row 0, Owner toggle disabled).

**Enforcement in three layers (defense in depth):**
1. **RLS** - data can't leave the tenant or bypass capability/period checks even if the app is wrong.
2. **Server Action guards** - every mutation calls `requireCapability(cap, companyId)` and, where relevant, `requirePeriodMutable(periodId)` before touching data.
3. **UI gating** - disabled controls + tooltips, exactly as the prototype dims locked nav and shows "Select a specific company to access this workspace."

**Per-company scoping** is first-class: the Company Access matrix is the source of truth, so all checks
take `(user, company, capability)`. Portfolio (All Companies) mode disables operational modules and, per
the `restrict-portfolio-roles` setting, can be limited to Owner/Admin/CFO.

---

## 4. Accounting Excel upload architecture

Mirrors the prototype's 4-step flow and 5 validation states, made real and resumable.

1. **Select scope** - company (from URL) + target period. If the period is `locked|closed`, block mutating
   actions and require Correction Mode (`period.correction_mode`) with an audited reason before replace/remove.
2. **Upload** - client uploads to a private Storage bucket at `company_id/{period}/{uuid}-{filename}`; create
   `accounting_files` row (`status=uploaded`). One file card with remove/replace.
3. **Validate** - an Edge Function (`parse-accounting-file`) parses with SheetJS/ExcelJS, stages rows, and
   runs the five checks from the prototype: period match, period mismatch (rows dated outside scope),
   missing FX rate (USD/EUR rows without a rate), existing-file replacement, locked-period check. Results
   stored as `validation` jsonb; status -> `validated`. Progress via Realtime.
4. **Confirm** - committing inserts `transactions`, links them to the period, and kicks off classification
   (Section 5). Status -> `committed`.

**Production concerns:** idempotent commit (re-running doesn't double-insert), replace-in-correction-mode is
an audited event (`audit_log` + `correction_reason`), large files processed off-request, column-mapping
tolerance (configurable header map per company since accounting exports vary), and a clear failure state
that doesn't leave half-committed transactions (wrap commit in a transaction / RPC).

---

## 5. Classification engine architecture

Deterministic, rule-based, with confidence tiers and a learning loop - matching the prototype's Rule Library
and Learning History exactly. (No ML required for v1; the design leaves room for it later.)

**Rule types** (from `ruleRows`): account code, keyword (must support **Georgian text** e.g. "საკომისიო"),
credit analytics, combined (Dr + Cr pattern, e.g. `1010 -> 6100`), exact description, fuzzy match.

**Pipeline** (runs on commit and on demand via "re-run"):
1. For each transaction, evaluate active rules by priority/specificity; first/best match assigns
   `class_id`, `matched_rule_id`, `confidence`, `source=auto`.
2. Unmatched -> `unclassified`. Fuzzy/low-confidence -> `review`. Foreign-currency rows without a rate ->
   `fx_missing`.
3. Confidence tiers drive the queue tabs and badges. Prototype thresholds: >= 90 green, 75-89 amber, < 75 red.
   Proposed mapping: `auto` >= ~90, `review` ~75-89, `unclassified`/manual below - **to confirm (Section 11)**.

**Learning loop:** a manual assignment can be "saved as a rule" (`classification_events.event_type =
manual_assignment_saved_as_rule`), immediately improving future uploads. Every confirm/reject/rule
create/disable is logged to `classification_events` and surfaced in Learning History. Rules are
**per-company** (structures and account codes differ across companies).

**Output:** once the queue is acceptable, "Generate Actual Cash Flow" aggregates classified transactions
into `cash_flow_entries` for the period (Section 6).

---

## 6. Cash Flow generation logic

This is the financial core and must match the prototype's math precisely.

**Identity (non-negotiable):**
- `Net = Operating + Investing + Financing`
- `Closing = Opening + Net`
- **Opening balance chains: a period's opening = the prior completed period's closing** (`opening_balance_source = carried`).
  Opening and Closing are balance rows, not flow rows.
- **MVP seed:** June 2026's opening = May 2026's closing taken from the existing Excel cash-flow file
  (`opening_balance_source = imported`). This single seed starts the live chain; every later period carries forward.
- **Historical years (2023/2024/2025)** can be imported later as **locked/static historical actuals**, not
  casually editable.
- **Manual opening-balance entry** is allowed only with permission (`period.set_opening_balance`) and is
  always audit-logged (`opening_balance_source = manual`, with `set_by`/`set_at`).

**Aggregation:** classified transactions -> sum per class (signed by cash direction) -> roll up Class ->
Group -> Section -> Net -> Closing, following the `cf_nodes` tree. This is the production equivalent of the
prototype's `cashflowTree` walk in `extraVals`.

**Balances vs flows (critical):** balances are **never summed across periods**. Per the prototype's
`cfBalanceCells`: opening of a multi-month column = opening of its first month; closing = closing of its
last month; only flow rows sum. Year/multi-year columns chain opening across prior years using net, never
addition of openings.

**Period column builder:** port `cfColumns` / `cfNodeVal` exactly - Month / Quarter / Year / Custom /
Multi-Year, each with Summary / Detailed / Actual-vs-Forecast views, and the FY-vs-YTD labeling driven by
`currentYear` + `latestActualMonth`. Forecast columns render tinted (`#F3F7F8` / `#37576A`) and the table is
keyed by `period + view` so forecast tint never leaks into Detailed view.

**Snapshot vs live:** recommend **snapshotting** actuals into `cash_flow_entries` when a period is generated
/ closed (immutable, fast, auditable), and **live-computing** for open `draft|active` periods so editing is
immediate. Currency conversion (Section 8) is applied at presentation, not stored.

---

## 6a. Period & forecast lifecycles (separate)

Accounting periods and forecast versions have **independent** lifecycles, stored in different tables. They
can be compared (actual vs forecast) but never share a state column.

**Accounting period lifecycle** (`periods.status`):

| State | What it allows | Who acts |
|---|---|---|
| **Draft** | Upload files, run validation, review/assign classifications. | Accountant / Editor |
| **Active / In Review** | Generate cash flow; Finance Manager / CFO reviews. | Editor prepares; CFO reviews |
| **Locked** | Approved for normal monthly reporting. **No edits unless Correction Mode.** | CFO / Owner (with `period.approve_lock`) |
| **Closed** | Final close. When all 12 months of a year are Closed, FY labeling is enabled for that year. | CFO / Owner |
| **Archived** | Historical, read-only. | Admin / Owner |

Forward transitions follow the order above; Locked<->Closed is gated by `period.approve_lock`; Archived is
terminal (read-only). Mutating actions on Locked/Closed periods are blocked unless Correction Mode is on.

**Correction Mode** (to modify a Locked or Closed period):
- Requires permission (`period.correction_mode`) and a reason/comment.
- Writes an `audit_log` entry on enable and on each mutation performed while active.
- Replacing an uploaded file marks the old file `superseded` and **retains** it - audit history is preserved;
  nothing is silently overwritten.

**Actors (role -> period capabilities):**
- **Accountant / Editor** - upload, classify, prepare a period (Draft/Active work). No lock/close/correction.
- **Finance Manager / CFO** - review, generate, approve, lock/close periods, enable Correction Mode (if permitted).
- **Admin / Owner** - users, roles, company access, company settings, plus override/admin actions.

**Forecast / budget lifecycle** (`forecast_versions.status`, independent): Draft -> Active -> Approved -> Archived.
- Editable only in Draft/Active; Approved is a locked snapshot; Archived is read-only.
- **Forecast Approved does not imply Period Locked, and vice versa.** Exactly one `active` version per company
  drives forecast columns in Cash Flow / Variance / Dashboard.

---

## 6b. Versioned cash-flow structure

The cash-flow structure is **versioned**, not edited in place.
- Closed/locked historical periods **preserve the exact structure that was active** when they were
  generated/closed (via `periods.structure_version_id`). Historical statements and reports render against
  that pinned snapshot, never against mutable live `cf_nodes`.
- Reordering, renaming, adding, deactivating, or moving a line item creates/advances a **draft** structure
  version that, on save, becomes the new `active` version - affecting **future/open periods only**.
- Applying a change to an already closed/locked period is possible **only via Correction Mode** as a
  controlled historical correction (permission + reason + audit).
- **Forecast/Budget mirrors the structure version pinned to its forecast version**, so a forecast and its
  comparison actuals always line up.
- All structure changes are audit-logged.

## 6c. Portfolio consolidation basis

All Companies (Portfolio) mode consolidates at the **common top level, in GEL** (default portfolio currency):
- Lines: Operating / Investing / Financing Cash Flow, Net Cash Flow, Opening Cash Balance, Closing Cash Balance.
- Per-company rows stay separate; a **consolidated total row** sits beneath them (never a single grand total).
- MVP does **not** force line-by-line detailed consolidation when companies have different class structures -
  detailed, company-specific structure stays inside each company workspace. High-level sections + key KPIs first.

---

## 7. Forecast & Budget architecture

**Mirror rule:** the forecast grid is built from the *same* `cf_nodes` tree as Cash Flow - identical
sections, groups, classes, and the same Opening/Net/Closing rows. In the prototype this is literally the
same `cashflowTree` + `cfColumns`; production keeps a single structure source so they can never drift.

**Version lifecycle** (from `fcVersions`): `draft -> active -> approved (locked) -> archived`.
- Editable only when `draft` or `active` (prototype: `editable = status==='Draft' || status==='Active'`).
- `approved` = locked/immutable snapshot; `archived` = read-only (e.g. "FY2025 Actuals").
- Exactly one `active` version per company drives the forecast columns shown in Cash Flow, Variance, and Dashboard.

**Entry storage:** `forecast_entries(version_id, class_id, year, month, amount)`. Cell edits write here and
append to `forecast_change_log` (the prototype's change-history table). Approve = freeze + audit.

**Excel import/export:** template download matches the current structure; import maps rows to classes and
reports matched / missing / unknown-class counts and detected period (prototype's `fcImport`). Unknown
classes route to a review step rather than silently dropping. Export reproduces the structure + monthly grid.

**FY vs YTD / forward plans:** forecast versions may legitimately hold full-year forward plans
(`FY2026 Budget/Forecast`) even though actuals for 2026 are YTD - the labeling logic already distinguishes
these.

---

## 8. FX / NBG rate handling

**Actual transactions use the transaction-date FX rate** (no period-average / period-end for MVP actual
cash-flow generation). `fx_rates(pair, rate_date, rate, source)`.

**Resolution order per foreign-currency transaction** (resolved at ingest, stored on the row as
`fx_rate_to_gel` + `fx_rate_source` + `fx_rate_date`):
1. **Imported rate** present in the accounting file -> use it (`source = imported`).
2. Else **NBG rate for the exact transaction date** -> use it (`source = nbg`).
3. Else **latest available prior NBG rate** -> use it, flagged system-filled (`source = nbg_prior_filled`).
4. Else -> row goes to the **FX Rate Missing** review queue (no silent zero/guess).

`amount_gel = original_amount * fx_rate_to_gel` (GEL-base rows have rate 1.0). GEL is the normalized/display
default; the USD toggle is a **read-time** conversion that applies this same policy/rate basis - never stored.

- **Supported currencies (MVP): GEL, USD, EUR.** GEL needs no conversion (rate 1.0). USD/EUR use the
  transaction-date resolution above. **Any other currency** in an import goes to an **FX Rate Missing /
  Unsupported Currency** review requiring manual handling - never silently converted.
- **NBG integration:** a scheduled Edge Function (`nbg-fx-sync`) pulls NBG official daily rates from
  `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json` and upserts `fx_rates(source='nbg')` for
  USD and EUR (and others as needed), idempotent per date. Weekends/holidays are handled by the prior-rate
  fallback at resolution time (case 3 above).
- **Per-company base currency:** base currency is configurable (default GEL); conversion is directional, not a
  single global GEL->USD constant. No company is hardcoded to USD.
- **Future (post-MVP, optional):** period-average / period-end rates may be added as a reporting-only setting;
  they will not change actual transaction conversion.

---

## 9. Reports / export architecture

**Report types** (from `repTypes`): Summary, Cash Flow Statement, Actual vs Forecast, Variance Analytics,
Portfolio Overview, Raw Transactions (gated), Full Management Pack. Include options (KPIs / tables / charts
/ combinations) and format (PDF / Excel / Both).

**Flow:** configure -> **preview** (renders the real data, as the prototype does) -> generate ->
store in Storage -> add an `reports` archive row -> download / print. Big files generate asynchronously
in the `generate-report` Edge Function with a row-count estimate shown up front (prototype shows
`~ 5,120 rows` for portfolio).

**Builders:**
- **Excel:** ExcelJS, multi-sheet (Summary, Cash Flow, Forecast, AvF, Variance, and Raw Transactions only
  when permitted) - exactly the `repSheets` set, with the Raw sheet gated.
- **PDF:** server-side render of the same React report components (React-PDF, or Playwright print for
  pixel parity with the on-screen preview). Shared money formatter guarantees accounting parentheses
  everywhere.

**Rules baked in:**
- **Raw transaction export is permission-gated** (`export.raw`) at RLS + action + UI, and reflected in the
  Security Settings toggle.
- **Portfolio reports always show per-company rows plus a consolidated total**, never one grand total
  (`repCompanyRows` + `repCompanyTotal`).
- **Every export / print / download / archive is audit-logged** (the prototype appends "logged to audit" to
  each action).

The top-bar Export button is context-aware: it summarizes what will export (title, company/portfolio
context, period, currency, view) and deep-links into the Reports Center, matching `exportVals`.

---

## 10. Implementation phases

Sequenced by dependency. Each phase ends shippable and demoable against the prototype.

| Phase | Scope | Why first / depends on |
|---|---|---|
| **0 - Foundation** | Next.js + TS + Supabase wiring, Auth, design tokens from the brand system, app shell (sidebar, top bar, account menu), global period + currency providers, money/percent formatters (accounting parentheses), base RLS helpers (`auth_company_ids`, `auth_can`), and the **core schema migration**: organizations, companies (configurable base_currency, default GEL), profiles, memberships, roles/role_permissions (capability keys incl. `period.set_opening_balance`), periods (with opening-balance + lifecycle fields), fx_rates, audit_log (append-only). | Everything sits on this; the period engine, formatter, currency model, and period/forecast lifecycles are used by every module, so their schema must land first. |
| **1 - Companies & Structure** | Companies CRUD + **base-currency setting (Admin-only)**, `cf_nodes` tree, Structure Builder (drag-drop, inspector, validation, copy-from-company, change history), and the **period lifecycle skeleton** (Draft/Active/Locked/Closed/Archived states + `requirePeriodMutable` guard + Correction-Mode scaffolding) so later phases enforce it from day one. | Structure is the backbone for Cash Flow, Forecast, Classification, Variance; the lifecycle guard gates uploads/edits starting in Phase 2. |
| **2 - Upload & Classification** | Storage bucket, parse/validate Edge Function, transactions, rule engine, Class/Rule libraries, Learning History, queues. | Produces the classified data the cash flow is generated from. |
| **3 - Cash Flow** | Period model port, column builder, balance logic, Generate Actual, the Excel-style statement (3 views). | Depends on structure (1) + classified transactions (2). |
| **4 - Forecast & Budget** | Versions + lifecycle, mirrored grid, Excel import/export, change log. | Mirrors structure (1); feeds forecast columns into 3/5/6. |
| **5 - Variance Analytics** | Aggregations (class/dept/section/month), severity model, drill-down to detail + transaction preview. | Needs actuals (3) + active forecast (4). |
| **6 - Portfolio & Dashboard** | Consolidated portfolio (per-company + total, read-only), single-company dashboard, charts. | Needs per-company actuals/forecast across the portfolio. |
| **7 - Reports / Export & FX/NBG** | Report center, Excel/PDF builders, archive, raw-export gating, `fx_rates`, NBG sync, USD toggle end-to-end. | Consumes all module data; FX affects every figure. |
| **8 - Admin, Period Lifecycle, Mobile, Hardening** | Users/Roles/Company Access/Invitations/Audit/Security, period state machine (Draft/Active/Locked/Closed/Archived) + Correction Mode, mobile read-only, perf, accessibility, audit completeness. | Governance layer over everything; period locking touches uploads, forecast, cash flow. |

(Period **status gating** is enforced from Phase 2 onward as a guard; the full lifecycle UI and admin land in Phase 8.)

---

## 11. Risks & open questions

These need your decisions before or during the relevant phase. Items marked **[blocking]** affect schema or
core math and should be resolved early.

1. **[RESOLVED] FX conversion policy for actuals.** Transaction-date rate. Resolution order: imported ->
   NBG exact date -> latest prior NBG (system-filled) -> FX Rate Missing queue. No period-average/period-end
   for MVP actuals. (See Section 8.)
2. **[RESOLVED] Per-company base currency.** Configurable per company, default GEL; no company hardcoded to
   USD. Store `original_amount`/`original_currency`/`fx_rate_to_gel`/`amount_gel`; display currency derived at
   UI/report layer. (See Sections 2 and 8.)
3. **[RESOLVED] Opening-balance source.** Carry prior completed period's closing. MVP seed: June 2026 opening
   = May 2026 closing from the existing Excel file. Historical years import later as locked actuals; manual
   entry is permissioned + audited. (See Section 6.)
4. **[RESOLVED] Period state machine.** Draft -> Active/In Review -> Locked -> Closed -> Archived, separate
   from the forecast lifecycle; actors and Correction Mode rules defined in Section 6a.
5. **Snapshot vs live cash flow.** Confirm the recommended approach: snapshot actuals on generate/close,
   live-compute for open periods.
6. **Classification confidence thresholds.** Confirm the auto / review / unclassified cutoffs (proposed
   auto >= 90, review 75-89). Drives how much manual review the team does monthly.
7. **[RESOLVED] Structure changes vs historical periods.** Versioned structure; closed/locked periods pin
   their snapshot. See Section 6b.
8. **[RESOLVED] Portfolio consolidation.** Top-level sections + KPIs, consolidated in GEL, per-company rows +
   total. See Section 6c.
9. **Georgian-language + accounting-format specifics.** Confirm expected Excel layouts per accounting system,
   decimal/thousand conventions, and that keyword matching must handle Georgian script (it appears in the
   rules). *Non-blocking; matters at Phase 2.*
10. **[RESOLVED] NBG API + currencies.** Endpoint `https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json`;
    GEL/USD/EUR for MVP; others -> Unsupported Currency review. See Section 8.
11. **Custom role granularity & audit immutability.** Confirm custom roles use the same capability keys, and
    that `audit_log` is strictly append-only (no edit/delete, even by Owner). *Phase 0 builds it append-only by
    default.*
12. **[RESOLVED] Data volume & retention.** Thousands-tens of thousands tx / company / month; 2023-2025 as
    locked static actuals; correct indexes from the start, no million-row over-engineering. See Section 2.
13. **Real-time collaboration.** Concurrent editing of Structure Builder / Forecast, or single-editor with
    last-write-wins + change log (what the prototype implies)? *Non-blocking; matters at Phase 1/4.*
14. **Hosting/region & compliance.** Supabase region (EU/Georgia data residency?), backup/PITR expectations
    for financial data. *Non-blocking; decide before production launch.*

---

## Recommended stack (confirmed against the brief)

Next.js (App Router) + TypeScript - Supabase Postgres + Auth + Storage + Edge Functions - RLS-based
role/permission enforcement - ExcelJS + React-PDF/Playwright for export - scheduled NBG FX sync. This matches
the brief and fits the prototype's behavior without over-engineering.

---

---

## 12. Git & implementation workflow

- Work in the clean project root; **initialize git** if absent.
- Each phase on its own **feature branch** (Phase 0: `phase-0-foundation`).
- **Never commit secrets.** Provide `.env.local.example`; `.env.local` is git-ignored and never committed.
- Commit a phase only **after typecheck/build validation passes**.
- Incremental and safe: build only the agreed scope for the phase; no jumping ahead into Excel import,
  classification, or full UI binding unless a phase explicitly needs a stub.

---

## Phase 0 - approved scope (building now)

Next.js + TS app foundation - Supabase/Postgres schema foundation - Auth scaffolding - core DB migrations -
RLS helper design - companies (configurable base_currency) - profiles/memberships/roles/permissions - periods
(lifecycle + opening-balance fields) - `cf_structure_versions` + structure FK columns (versioning from day one) -
fx_rates (GEL/USD/EUR) - append-only audit_log - app shell foundation - period/currency providers -
accounting-parentheses number formatter - initial project documentation. **No** Excel import, classification
engine, or full data binding in Phase 0.
