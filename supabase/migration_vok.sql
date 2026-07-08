-- ============================================================================
--  VOC как вторая метрика супер-бонуса (решение созвона 2026-07-03).
--  Помимо +3 за лучший FCR недели — отдельно +3 за лучший VOC недели.
--  Применена в проде через Supabase MCP. Дубль здесь для истории/локали.
-- ============================================================================
alter table public.scores
  add column if not exists vok             int not null default 0 check (vok between 0 and 100),
  add column if not exists super_bonus_vok int not null default 0 check (super_bonus_vok in (0,3));

-- Рейтинг теперь суммирует оба супер-бонуса.
create or replace function public.get_rating()
returns table (id uuid, name text, site text, hue int, total bigint, coins int)
language sql stable security definer set search_path = public as $fn$
  select t.id, t.name, t.site, t.hue,
         coalesce(sum(s.cases + s.bonus + s.super_bonus + s.super_bonus_vok), 0)::bigint as total,
         t.coins
  from public.teams t
  left join public.scores s on s.team_id = t.id
  where t.is_active
  group by t.id
  order by total desc, t.name;
$fn$;
