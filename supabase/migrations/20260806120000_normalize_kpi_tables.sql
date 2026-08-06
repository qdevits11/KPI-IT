-- KPI·IT: schéma relationnel (remplace le document JSON singleton pour le domaine).
-- Accès serveur uniquement via service_role (RLS on, pas de policies anon/authenticated).
-- kpi_app_state est conservé comme archive / secours après migration des données.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.kpi_meta (
  id text primary key default 'default',
  schema_version integer not null default 3,
  revision integer not null default 1,
  year integer not null,
  updated_at timestamptz not null default now()
);

comment on table public.kpi_meta is
  'Métadonnées singleton KPI·IT (version schéma, révision OCC, année courante).';

create table if not exists public.kpi_weeks (
  week_id text primary key,
  year integer not null,
  month integer not null,
  week integer not null,
  tickets_hors_sla_cloture integer,
  tickets_hors_sla_prise_en_charge integer,
  demandes_it_hebdo integer,
  demandes_non_resolues_hebdo integer,
  open_frozen_at timestamptz,
  informations text not null default '',
  reaction text not null default '',
  jira_synced_at timestamptz,
  updated_at timestamptz,
  constraint kpi_weeks_year_week_unique unique (year, week)
);

create index if not exists kpi_weeks_year_week_idx
  on public.kpi_weeks (year desc, week desc);

comment on table public.kpi_weeks is
  'Lignes hebdomadaires KPI (SLA, demandes IT, non résolus, retour semaine).';

create table if not exists public.kpi_log_events (
  id text primary key,
  kind text not null check (kind in ('metier', 'odoo', 'maintenance')),
  event_date date not null,
  year integer not null,
  month integer not null,
  week integer not null,
  explanation text not null default '',
  responsible text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists kpi_log_events_kind_date_idx
  on public.kpi_log_events (kind, event_date desc);

comment on table public.kpi_log_events is
  'Journaux d''encodage manuel (automatisations métier / Odoo / maintenances).';

create table if not exists public.kpi_phishing_events (
  id text primary key,
  event_date date not null,
  year integer not null,
  month integer not null,
  week integer not null,
  failures integer not null default 0,
  explanation text not null default '',
  responsible text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists kpi_phishing_events_date_idx
  on public.kpi_phishing_events (event_date desc);

comment on table public.kpi_phishing_events is
  'Échecs phishing encodés manuellement.';

create table if not exists public.kpi_ticket_breakdowns (
  week_id text not null,
  dimension text not null check (dimension in ('type', 'assignee', 'requester')),
  label text not null,
  count integer not null default 0 check (count >= 0),
  primary key (week_id, dimension, label)
);

create index if not exists kpi_ticket_breakdowns_dim_week_idx
  on public.kpi_ticket_breakdowns (dimension, week_id);

comment on table public.kpi_ticket_breakdowns is
  'Ventilations tickets créés par semaine (type / assigné / demandeur).';

create table if not exists public.kpi_access_users (
  email text primary key,
  display_name text,
  avatar_url text,
  is_admin boolean not null default false,
  is_kpi_responsible boolean not null default false,
  is_encoding_responsible boolean not null default false,
  last_login_at timestamptz,
  updated_at timestamptz
);

comment on table public.kpi_access_users is
  'Comptes applicatifs et droits (admin / KPI / encodage).';

create table if not exists public.kpi_people (
  display_name text primary key,
  account_id text,
  avatar_url text,
  updated_at timestamptz
);

comment on table public.kpi_people is
  'Annuaire avatars / accountId Jira (clé = displayName).';

create table if not exists public.kpi_settings (
  id text primary key default 'default',
  responsibles text[] not null default '{}',
  updated_at timestamptz not null default now()
);

comment on table public.kpi_settings is
  'Paramètres applicatifs (liste des responsables d''encodage).';

-- Connexion Jira : s''assurer que la table existe (manquait du repo)
create table if not exists public.kpi_jira_connection (
  id text primary key default 'default',
  cipher text not null,
  updated_at timestamptz not null default now()
);

comment on table public.kpi_jira_connection is
  'Encrypted Jira credentials for KPI·IT (shared across devices). Cipher produced by app AES-GCM.';

-- ---------------------------------------------------------------------------
-- RLS + grants (service_role only)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'kpi_meta',
    'kpi_weeks',
    'kpi_log_events',
    'kpi_phishing_events',
    'kpi_ticket_breakdowns',
    'kpi_access_users',
    'kpi_people',
    'kpi_settings',
    'kpi_jira_connection',
    'kpi_app_state'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      t
    );
  end loop;
end $$;
