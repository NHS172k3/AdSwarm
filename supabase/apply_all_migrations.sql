-- Consolidated migration bundle for the AdSwarm demo.
-- Safe to run multiple times (all statements are idempotent: IF NOT EXISTS / guarded DO blocks).
-- Apply via Supabase Dashboard > SQL Editor (paste + Run), or via CLI (see notes at bottom).
-- Order matters: campaign_artifacts references campaign_runs(id).

-- ===========================================================================
-- 0001_adswarm_audit.sql  (legacy audit schema; retained for migration parity)
-- ===========================================================================
create extension if not exists pgcrypto;

create table if not exists campaigns (
  id uuid primary key,
  product_name text not null,
  brief text not null,
  budget_usdc numeric not null,
  audience text,
  cta text,
  status text not null,
  payment_mode text not null,
  spent_usdc numeric not null default 0,
  generation_cost_usdc numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  agent_id text not null,
  label text not null,
  wallet_address text not null,
  balance_usdc numeric not null default 0,
  funded boolean not null default false,
  can_send boolean not null default false,
  status text not null default 'idle',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  kind text not null,
  from_label text not null,
  to_label text not null,
  from_address text not null default '',
  to_address text not null,
  amount_usdc numeric not null,
  tx_hash text not null unique,
  explorer_url text not null,
  status text not null,
  memo text not null default '',
  block_number bigint,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists placements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  slot_id text not null,
  publisher text not null,
  price_usdc numeric not null,
  payment_tx_hash text not null,
  proof text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists artifacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  type text not null,
  producer text not null,
  version integer not null default 1,
  title text not null,
  storage_url text,
  preview_text text,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_created on campaigns(created_at desc);
create index if not exists idx_payments_campaign on payments(campaign_id);
create index if not exists idx_placements_campaign on placements(campaign_id);
create index if not exists idx_artifacts_campaign on artifacts(campaign_id);

-- ===========================================================================
-- 0002_campaign_runs.sql  (REQUIRED by app: audit-store.ts writes here)
-- ===========================================================================
create table if not exists campaign_runs (
  id uuid primary key,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  status text not null,
  mode text not null,
  draft jsonb not null,
  questions jsonb not null default '[]'::jsonb,
  proposals jsonb not null default '[]'::jsonb,
  wallets jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  artifacts jsonb not null default '[]'::jsonb,
  summary jsonb,
  note text
);

create index if not exists idx_campaign_runs_created_at on campaign_runs(created_at desc);
create index if not exists idx_campaign_runs_updated_at on campaign_runs(updated_at desc);

alter table campaign_runs enable row level security;

-- ===========================================================================
-- 20260712143000_reconcile_audit_rls.sql  (RLS + service_role policies)
-- ===========================================================================
create extension if not exists pgcrypto;

alter table if exists campaigns enable row level security;
alter table if exists agents enable row level security;
alter table if exists payments enable row level security;
alter table if exists placements enable row level security;
alter table if exists artifacts enable row level security;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaigns')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaigns' and policyname = 'campaigns_service_role_all') then
    create policy campaigns_service_role_all on campaigns for all to service_role using (true) with check (true);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'agents')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'agents' and policyname = 'agents_service_role_all') then
    create policy agents_service_role_all on agents for all to service_role using (true) with check (true);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payments')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'payments_service_role_all') then
    create policy payments_service_role_all on payments for all to service_role using (true) with check (true);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'placements')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'placements' and policyname = 'placements_service_role_all') then
    create policy placements_service_role_all on placements for all to service_role using (true) with check (true);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'artifacts')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'artifacts' and policyname = 'artifacts_service_role_all') then
    create policy artifacts_service_role_all on artifacts for all to service_role using (true) with check (true);
  end if;
end
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_runs') then
    alter table campaign_runs add column if not exists user_id uuid references auth.users (id) on delete set null;
    alter table campaign_runs alter column id set default gen_random_uuid();
    alter table campaign_runs alter column created_at set default now();
    alter table campaign_runs alter column updated_at set default now();
    alter table campaign_runs enable row level security;
    create index if not exists idx_campaign_runs_user_id on campaign_runs(user_id);
    create index if not exists idx_campaign_runs_status_updated_at on campaign_runs(status, updated_at desc);
  end if;
end
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_runs')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_runs' and policyname = 'campaign_runs_service_role_all') then
    create policy campaign_runs_service_role_all on campaign_runs for all to service_role using (true) with check (true);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'campaign_runs')
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_runs' and policyname = 'campaign_runs_user_owned') then
    create policy campaign_runs_user_owned on campaign_runs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end
$$;

-- ===========================================================================
-- 20260712154500_campaign_artifacts.sql  (REQUIRED: image/video artifact rows)
-- ===========================================================================
create table if not exists campaign_artifacts (
  id text primary key,
  run_id uuid not null references campaign_runs(id) on delete cascade,
  type text not null,
  producer text not null,
  version integer not null default 1,
  title text not null,
  storage_url text,
  preview_text text,
  status text not null,
  metadata jsonb not null default '{}'::jsonb,
  artifact jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_campaign_artifacts_run_id on campaign_artifacts(run_id);
create index if not exists idx_campaign_artifacts_type_updated_at on campaign_artifacts(type, updated_at desc);

alter table campaign_artifacts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'campaign_artifacts' and policyname = 'campaign_artifacts_service_role_all') then
    create policy campaign_artifacts_service_role_all on campaign_artifacts for all to service_role using (true) with check (true);
  end if;
end
$$;

-- ===========================================================================
-- Notes:
--   CLI (uses the individual migration files, not this bundle):
--     supabase db push --db-url "postgresql://postgres:<DB_PASSWORD>@db.nurqebqwnxugeivpczhu.supabase.co:5432/postgres"
--   Dashboard: paste this whole file into SQL Editor and Run.
-- ===========================================================================
