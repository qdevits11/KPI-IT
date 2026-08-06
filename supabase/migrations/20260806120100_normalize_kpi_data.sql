-- ---------------------------------------------------------------------------
-- Migration données depuis kpi_app_state (idempotente si kpi_meta déjà peuplé)
-- ---------------------------------------------------------------------------

do $$
declare
  doc jsonb;
  rev integer;
  yr integer;
begin
  if exists (select 1 from public.kpi_meta where id = 'default') then
    return;
  end if;

  select data into doc from public.kpi_app_state where id = 'default';
  if doc is null then
    insert into public.kpi_meta (id, schema_version, revision, year)
    values ('default', 3, 1, extract(year from now())::integer);
    insert into public.kpi_settings (id, responsibles)
    values ('default', '{}');
    return;
  end if;

  rev := coalesce((doc->>'revision')::integer, 1);
  yr := coalesce((doc->>'year')::integer, extract(year from now())::integer);

  insert into public.kpi_meta (id, schema_version, revision, year, updated_at)
  values ('default', 3, rev, yr, now());

  insert into public.kpi_weeks (
    week_id, year, month, week,
    tickets_hors_sla_cloture, tickets_hors_sla_prise_en_charge,
    demandes_it_hebdo, demandes_non_resolues_hebdo,
    open_frozen_at, informations, reaction, jira_synced_at, updated_at
  )
  select
    format(
      '%s-S%s',
      (w->>'year')::int,
      lpad((w->>'week')::text, 2, '0')
    ),
    (w->>'year')::int,
    (w->>'month')::int,
    (w->>'week')::int,
    case when (w->>'ticketsHorsSlaCloture') ~ '^-?[0-9]+$' then (w->>'ticketsHorsSlaCloture')::int end,
    case when (w->>'ticketsHorsSlaPriseEnCharge') ~ '^-?[0-9]+$' then (w->>'ticketsHorsSlaPriseEnCharge')::int end,
    case when (w->>'demandesItHebdo') ~ '^-?[0-9]+$' then (w->>'demandesItHebdo')::int end,
    case when (w->>'demandesNonResoluesHebdo') ~ '^-?[0-9]+$' then (w->>'demandesNonResoluesHebdo')::int end,
    case when (w->>'openFrozenAt') ~ '^[0-9]{4}-' then (w->>'openFrozenAt')::timestamptz end,
    coalesce(w->>'informations', ''),
    coalesce(w->>'reaction', ''),
    case when (w->>'jiraSyncedAt') ~ '^[0-9]{4}-' then (w->>'jiraSyncedAt')::timestamptz end,
    case when (w->>'updatedAt') ~ '^[0-9]{4}-' then (w->>'updatedAt')::timestamptz end
  from jsonb_array_elements(coalesce(doc->'weeks', '[]'::jsonb)) w
  on conflict (week_id) do nothing;

  insert into public.kpi_log_events (
    id, kind, event_date, year, month, week, explanation, responsible
  )
  select
    coalesce(nullif(e->>'id', ''), 'metier-' || gen_random_uuid()::text),
    'metier',
    coalesce(
      case when (e->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (e->>'date')::date end,
      (make_date((e->>'year')::int, 1, 4) + (((e->>'week')::int - 1) * 7))
    ),
    (e->>'year')::int,
    (e->>'month')::int,
    (e->>'week')::int,
    coalesce(e->>'explanation', ''),
    coalesce(e->>'responsible', '')
  from jsonb_array_elements(coalesce(doc->'automationsMetier', '[]'::jsonb)) e
  on conflict (id) do nothing;

  insert into public.kpi_log_events (
    id, kind, event_date, year, month, week, explanation, responsible
  )
  select
    coalesce(nullif(e->>'id', ''), 'odoo-' || gen_random_uuid()::text),
    'odoo',
    coalesce(
      case when (e->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (e->>'date')::date end,
      (make_date((e->>'year')::int, 1, 4) + (((e->>'week')::int - 1) * 7))
    ),
    (e->>'year')::int,
    (e->>'month')::int,
    (e->>'week')::int,
    coalesce(e->>'explanation', ''),
    coalesce(e->>'responsible', '')
  from jsonb_array_elements(coalesce(doc->'automationsOdoo', '[]'::jsonb)) e
  on conflict (id) do nothing;

  insert into public.kpi_log_events (
    id, kind, event_date, year, month, week, explanation, responsible
  )
  select
    coalesce(nullif(e->>'id', ''), 'maintenance-' || gen_random_uuid()::text),
    'maintenance',
    coalesce(
      case when (e->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (e->>'date')::date end,
      (make_date((e->>'year')::int, 1, 4) + (((e->>'week')::int - 1) * 7))
    ),
    (e->>'year')::int,
    (e->>'month')::int,
    (e->>'week')::int,
    coalesce(e->>'explanation', ''),
    coalesce(e->>'responsible', '')
  from jsonb_array_elements(coalesce(doc->'maintenances', '[]'::jsonb)) e
  on conflict (id) do nothing;

  insert into public.kpi_phishing_events (
    id, event_date, year, month, week, failures, explanation, responsible
  )
  select
    coalesce(nullif(e->>'id', ''), 'phish-' || gen_random_uuid()::text),
    coalesce(
      case when (e->>'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (e->>'date')::date end,
      (make_date((e->>'year')::int, 1, 4) + (((e->>'week')::int - 1) * 7))
    ),
    (e->>'year')::int,
    (e->>'month')::int,
    (e->>'week')::int,
    case when (e->>'failures') ~ '^-?[0-9]+$' then (e->>'failures')::int else 0 end,
    coalesce(e->>'explanation', ''),
    coalesce(e->>'responsible', '')
  from jsonb_array_elements(coalesce(doc->'phishing', '[]'::jsonb)) e
  on conflict (id) do nothing;

  insert into public.kpi_ticket_breakdowns (week_id, dimension, label, count)
  select
    week_id,
    'type',
    label,
    greatest(coalesce(cnt::int, 0), 0)
  from jsonb_each(coalesce(doc->'ticketsByType', '{}'::jsonb)) as weeks(week_id, bag)
  cross join lateral jsonb_each_text(bag) as items(label, cnt)
  on conflict (week_id, dimension, label) do nothing;

  insert into public.kpi_ticket_breakdowns (week_id, dimension, label, count)
  select
    week_id,
    'assignee',
    label,
    greatest(coalesce(cnt::int, 0), 0)
  from jsonb_each(coalesce(doc->'ticketsByAssignee', '{}'::jsonb)) as weeks(week_id, bag)
  cross join lateral jsonb_each_text(bag) as items(label, cnt)
  on conflict (week_id, dimension, label) do nothing;

  insert into public.kpi_ticket_breakdowns (week_id, dimension, label, count)
  select
    week_id,
    'requester',
    label,
    greatest(coalesce(cnt::int, 0), 0)
  from jsonb_each(coalesce(doc->'ticketsByRequester', '{}'::jsonb)) as weeks(week_id, bag)
  cross join lateral jsonb_each_text(bag) as items(label, cnt)
  on conflict (week_id, dimension, label) do nothing;

  insert into public.kpi_access_users (
    email, display_name, avatar_url,
    is_admin, is_kpi_responsible, is_encoding_responsible,
    last_login_at, updated_at
  )
  select
    lower(trim(u->>'email')),
    nullif(trim(u->>'displayName'), ''),
    nullif(trim(u->>'avatarUrl'), ''),
    coalesce((u->>'isAdmin')::boolean, false),
    coalesce((u->>'isKpiResponsible')::boolean, false),
    coalesce((u->>'isEncodingResponsible')::boolean, false),
    case when (u->>'lastLoginAt') ~ '^[0-9]{4}-' then (u->>'lastLoginAt')::timestamptz end,
    case when (u->>'updatedAt') ~ '^[0-9]{4}-' then (u->>'updatedAt')::timestamptz end
  from jsonb_array_elements(coalesce(doc->'settings'->'accessUsers', '[]'::jsonb)) u
  where coalesce(nullif(trim(u->>'email'), ''), '') <> ''
  on conflict (email) do nothing;

  insert into public.kpi_people (display_name, account_id, avatar_url, updated_at)
  select
    key,
    nullif(trim(value->>'accountId'), ''),
    nullif(trim(value->>'avatarUrl'), ''),
    case when (value->>'updatedAt') ~ '^[0-9]{4}-' then (value->>'updatedAt')::timestamptz end
  from jsonb_each(coalesce(doc->'settings'->'peopleDirectory', '{}'::jsonb))
  on conflict (display_name) do nothing;

  insert into public.kpi_settings (id, responsibles, updated_at)
  values (
    'default',
    coalesce(
      (
        select array_agg(x order by x)
        from jsonb_array_elements_text(
          coalesce(doc->'settings'->'responsibles', '[]'::jsonb)
        ) as t(x)
      ),
      '{}'::text[]
    ),
    now()
  )
  on conflict (id) do nothing;
end $$;
