-- Nombre de tickets clôturés (resolutiondate) pendant la semaine

alter table public.kpi_weeks
  add column if not exists demandes_cloturees_hebdo integer;

comment on column public.kpi_weeks.demandes_cloturees_hebdo is
  'Tickets clôturés pendant la semaine (resolutiondate ∈ semaine).';
