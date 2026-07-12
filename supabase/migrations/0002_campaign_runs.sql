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
