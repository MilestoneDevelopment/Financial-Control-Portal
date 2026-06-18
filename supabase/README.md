# Supabase

## Migrations

`migrations/0001_core_schema.sql` - Phase 0 core schema: identity & access, companies (configurable base
currency), versioned cash-flow structure scaffold, periods (lifecycle + opening balance), FX rates, and an
append-only audit log. RLS is enabled on every table and resolved via the `auth_can` / `auth_can_org`
capability helpers.

### Applying

Choose one:

- **Supabase SQL editor** - paste the file contents and run.
- **Supabase CLI** - `supabase link --project-ref <ref>` then `supabase db push`.
- **MCP** - `apply_migration` with the file contents.

### Provisioning an organization

After the schema is applied and your first user has signed up (a `profiles` row is auto-created by trigger):

```sql
-- Create the holding org
insert into organizations (name) values ('Milestone') returning id;

-- Seed system roles + default permissions + security settings, and make the user Owner
select seed_org_defaults('<org-uuid>', '<owner-user-uuid>');
```

## Regenerating types

After schema changes, regenerate `db/types.ts`:

```bash
supabase gen types typescript --linked > ../db/types.ts
```

## Edge functions (later phases)

`functions/` will hold `parse-accounting-file` (Phase 2), `generate-report` (Phase 7) and `nbg-fx-sync`
(Phase 7). Not part of Phase 0.
