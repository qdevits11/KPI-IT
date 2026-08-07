-- Tokens OAuth personnels pour actions tickets (assignation, transitions…)
-- Distincts du compte de sync partagé (kpi_jira_connection).

create table if not exists public.kpi_user_jira_tokens (
  email text primary key,
  cipher text not null,
  updated_at timestamptz not null default now()
);

comment on table public.kpi_user_jira_tokens is
  'Tokens OAuth Jira personnels (chiffrés AES-GCM) pour actions tickets au nom de l’utilisateur connecté.';

alter table public.kpi_user_jira_tokens enable row level security;

revoke all on table public.kpi_user_jira_tokens from anon, authenticated;
grant all on table public.kpi_user_jira_tokens to service_role;
