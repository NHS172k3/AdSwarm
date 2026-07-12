create extension if not exists pgcrypto;

alter table if exists campaigns enable row level security;
alter table if exists agents enable row level security;
alter table if exists payments enable row level security;
alter table if exists placements enable row level security;
alter table if exists artifacts enable row level security;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'campaigns'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'campaigns' and policyname = 'campaigns_service_role_all'
  ) then
    create policy campaigns_service_role_all
      on campaigns
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'agents'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'agents' and policyname = 'agents_service_role_all'
  ) then
    create policy agents_service_role_all
      on agents
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'payments'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'payments' and policyname = 'payments_service_role_all'
  ) then
    create policy payments_service_role_all
      on payments
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'placements'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'placements' and policyname = 'placements_service_role_all'
  ) then
    create policy placements_service_role_all
      on placements
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'artifacts'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'artifacts' and policyname = 'artifacts_service_role_all'
  ) then
    create policy artifacts_service_role_all
      on artifacts
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_runs'
  ) then
    alter table campaign_runs add column if not exists user_id uuid references auth.users (id) on delete set null;
    alter table campaign_runs alter column id set default gen_random_uuid();
    alter table campaign_runs alter column created_at set default now();
    alter table campaign_runs alter column updated_at set default now();
    alter table campaign_runs enable row level security;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_runs'
  ) then
    create index if not exists idx_campaign_runs_user_id on campaign_runs(user_id);
    create index if not exists idx_campaign_runs_status_updated_at on campaign_runs(status, updated_at desc);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_runs'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'campaign_runs' and policyname = 'campaign_runs_service_role_all'
  ) then
    create policy campaign_runs_service_role_all
      on campaign_runs
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'campaign_runs'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'campaign_runs' and policyname = 'campaign_runs_user_owned'
  ) then
    create policy campaign_runs_user_owned
      on campaign_runs
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
