-- Ventilation stock ouvert par assigné (figé fin de semaine)

alter table public.kpi_ticket_breakdowns
  drop constraint if exists kpi_ticket_breakdowns_dimension_check;

alter table public.kpi_ticket_breakdowns
  add constraint kpi_ticket_breakdowns_dimension_check
  check (dimension in ('type', 'assignee', 'requester', 'open_assignee'));

comment on table public.kpi_ticket_breakdowns is
  'Ventilations tickets : créés (type/assigné/demandeur) + stock ouvert figé (open_assignee).';
