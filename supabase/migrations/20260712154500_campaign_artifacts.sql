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
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'campaign_artifacts' and policyname = 'campaign_artifacts_service_role_all'
  ) then
    create policy campaign_artifacts_service_role_all
      on campaign_artifacts
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;
