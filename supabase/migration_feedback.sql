-- ============================================================================
--  Форма обратной связи от тестировщиков (bug_reports)
--  Применена в проде через Supabase MCP. Дубль лежит здесь для истории/локали.
-- ============================================================================
create table if not exists public.bug_reports (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references public.teams(id) on delete set null,
  author      text not null,
  category    text not null default 'bug' check (category in ('bug','question','idea')),
  did         text not null,
  expected    text,
  got         text,
  device      text,
  status      text not null default 'new' check (status in ('new','seen','fixed')),
  created_at  timestamptz not null default now()
);

create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);

alter table public.bug_reports enable row level security;

drop policy if exists bug_reports_insert on public.bug_reports;
create policy bug_reports_insert on public.bug_reports for insert to authenticated
  with check (team_id = public.current_team_id() or public.is_admin());

drop policy if exists bug_reports_select on public.bug_reports;
create policy bug_reports_select on public.bug_reports for select to authenticated
  using (public.is_admin());

drop policy if exists bug_reports_update on public.bug_reports;
create policy bug_reports_update on public.bug_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update on public.bug_reports to authenticated;
