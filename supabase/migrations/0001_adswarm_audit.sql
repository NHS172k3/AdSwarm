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

