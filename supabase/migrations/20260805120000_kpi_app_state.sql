-- Document store for the KPI·IT AppDatabase JSON.
-- Server-only access via service_role (RLS on, no anon/authenticated policies).

create table if not exists public.kpi_app_state (
  id text primary key default 'default',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

comment on table public.kpi_app_state is
  'Singleton JSON document for KPI·IT (weeks, logs, ticket breakdowns, settings).';

alter table public.kpi_app_state enable row level security;

revoke all on table public.kpi_app_state from anon, authenticated;
grant select, insert, update, delete on table public.kpi_app_state to service_role;
