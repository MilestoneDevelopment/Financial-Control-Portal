-- =============================================================================
-- Financial Control Portal - 0004 design-consistent org provisioning
-- Adds provision_org(): a SECURITY DEFINER wrapper that creates an organization
-- and seeds its defaults in a single trusted call. This preserves the hardened
-- privilege model where service_role holds NO direct DML on business tables --
-- provisioning goes exclusively through SECURITY DEFINER functions owned by the
-- privileged (postgres) context, same pattern as seed_org_defaults (0001/0002).
-- Does not alter 0001/0002/0003 objects and grants no new table privileges.
-- =============================================================================

create or replace function public.provision_org(p_name text, p_owner uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_org uuid;
begin
  -- 1. name must not be blank
  if p_name is null or btrim(p_name) = '' then
    raise exception 'Organization name must not be blank.';
  end if;

  -- 2. owner must already have a profile (created by on_auth_user_created)
  if not exists (select 1 from profiles where id = p_owner) then
    raise exception 'Owner profile % does not exist. Have the user sign up first.', p_owner;
  end if;

  -- 3-4. create the organization, capture its id
  insert into organizations (name) values (btrim(p_name))
  returning id into new_org;

  -- 5. seed system roles, permissions, security settings and Owner membership
  perform seed_org_defaults(new_org, p_owner);

  -- 6. return the new organization id
  return new_org;
end;
$$;

-- 9-10. callable only by trusted server-side code (service_role), never via API
revoke execute on function public.provision_org(text, uuid) from public, anon, authenticated;
grant  execute on function public.provision_org(text, uuid) to service_role;
