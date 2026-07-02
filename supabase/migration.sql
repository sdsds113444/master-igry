-- ============================================================================
--  «Мастер игры» — миграция Supabase (демо-этап, Поток 1 / физлица)
-- ----------------------------------------------------------------------------
--  МОДЕЛЬ ДОСТУПА (безопасная для чужих команд):
--   • Каждый посетитель получает АНОНИМНУЮ сессию Supabase Auth (auth.uid()).
--   • Функция redeem_code(код) привязывает эту сессию к команде (team_sessions).
--   • RLS изолирует данные по этой привязке: команда видит ТОЛЬКО своё,
--     баллы себе поставить не может, чужой чат/ответы недоступны.
--   • Коды команд должны быть ДЛИННЫМИ и СЛУЧАЙНЫМИ (см. блок в конце) —
--     тогда их нельзя перебрать. KOYA-04 из демо — только для показа.
--
--  КАК ПРИМЕНИТЬ: Supabase → SQL Editor → New query → вставить ВЕСЬ файл → Run.
--  Идемпотентно (можно запускать повторно). Success. No rows returned = ок.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. ТАБЛИЦЫ
-- ---------------------------------------------------------------------------

-- Команды. code — секретный ключ входа (делаем длинным/случайным).
create table if not exists public.teams (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  site       text,
  mentor     text,
  hue        int  default 200,
  coins      int  default 40,
  is_active  boolean not null default true,
  created_at timestamptz default now()
);

-- Игры сезона (7). status: done / current / locked.
create table if not exists public.games (
  id        text primary key,
  num       int  not null,
  week      int  not null,
  title     text not null,
  skill     text,
  emoji     text,
  accent    text,
  status    text not null default 'locked' check (status in ('done','current','locked')),
  video_url text,
  file_url  text
);

-- Состав команды (капитан редактирует).
create table if not exists public.roster (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  full_name  text not null,
  is_captain boolean default false,
  ord        int default 0,
  created_at timestamptz default now()
);

-- Кейсы игры (то, что видит команда в задании).
create table if not exists public.cases (
  id         uuid primary key default gen_random_uuid(),
  game_id    text not null references public.games(id) on delete cascade,
  ord        int  default 1,
  title      text not null,
  difficulty text check (difficulty in ('Лёгкий','Средний','Сложный')),
  body       text
);

-- Баллы команды по игре + ОС тренера. Пишет только админ/тренер (см. RLS).
create table if not exists public.scores (
  team_id     uuid not null references public.teams(id) on delete cascade,
  game_id     text not null references public.games(id) on delete cascade,
  cases       int  default 0 check (cases between 0 and 30),
  bonus       int  default 0 check (bonus in (0,1)),
  super_bonus int  default 0 check (super_bonus in (0,3)),
  fcr         int  default 0 check (fcr between 0 and 100),
  feedback    text,
  updated_at  timestamptz default now(),
  primary key (team_id, game_id)
);

-- Ответ команды на игру (капитан сдаёт).
create table if not exists public.answers (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  game_id      text not null references public.games(id) on delete cascade,
  text         text,
  file_url     text,
  submitted_at timestamptz default now(),
  unique (team_id, game_id)
);

-- Чат команды (realtime).
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams(id) on delete cascade,
  author     text not null,
  text       text not null check (length(btrim(text)) > 0),
  created_at timestamptz default now()
);

-- Привязка анонимной сессии → команда + роль.
create table if not exists public.team_sessions (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  team_id    uuid references public.teams(id) on delete cascade,
  role       text not null default 'player' check (role in ('player','captain','admin')),
  created_at timestamptz default now()
);

-- Админ-коды (вход в админку), отдельно от команд.
create table if not exists public.admin_codes (
  code      text primary key,
  label     text,
  is_active boolean not null default true
);

create index if not exists roster_team_idx    on public.roster (team_id, ord);
create index if not exists scores_team_idx     on public.scores (team_id);
create index if not exists messages_team_idx    on public.messages (team_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. ХЕЛПЕРЫ (после таблиц — важно для порядка)
-- ---------------------------------------------------------------------------

-- team_id текущей сессии (null у админа/непривязанного)
create or replace function public.current_team_id()
returns uuid language sql stable security definer set search_path = public as $fn$
  select team_id from public.team_sessions where user_id = auth.uid();
$fn$;

-- текущий пользователь — админ?
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.team_sessions
    where user_id = auth.uid() and role = 'admin'
  );
$fn$;

-- Обмен кода на привязку сессии. Возвращает jsonb:
--   {role:'player', team:{...}}  |  {role:'admin'}  |  ошибка invalid_code
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_team  public.teams;
  v_admin public.admin_codes;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- админ-код?
  select * into v_admin from public.admin_codes
    where code = p_code and is_active;
  if found then
    insert into public.team_sessions (user_id, team_id, role)
      values (auth.uid(), null, 'admin')
      on conflict (user_id) do update set team_id = null, role = 'admin';
    return jsonb_build_object('role', 'admin');
  end if;

  -- код команды?
  select * into v_team from public.teams
    where code = p_code and is_active;
  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  insert into public.team_sessions (user_id, team_id, role)
    values (auth.uid(), v_team.id, 'player')
    on conflict (user_id) do update set team_id = v_team.id, role = 'player';

  return jsonb_build_object('role', 'player', 'team', to_jsonb(v_team));
end;
$fn$;

-- Рейтинг всех команд (только неконфиденциальные поля) — для общей доски.
create or replace function public.get_rating()
returns table (id uuid, name text, site text, hue int, total bigint, coins int)
language sql stable security definer set search_path = public as $fn$
  select t.id, t.name, t.site, t.hue,
         coalesce(sum(s.cases + s.bonus + s.super_bonus), 0)::bigint as total,
         t.coins
  from public.teams t
  left join public.scores s on s.team_id = t.id
  where t.is_active
  group by t.id
  order by total desc, t.name;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. ВКЛЮЧАЕМ RLS
-- ---------------------------------------------------------------------------
alter table public.teams          enable row level security;
alter table public.games          enable row level security;
alter table public.roster         enable row level security;
alter table public.cases          enable row level security;
alter table public.scores         enable row level security;
alter table public.answers        enable row level security;
alter table public.messages       enable row level security;
alter table public.team_sessions  enable row level security;
alter table public.admin_codes    enable row level security;

-- ---------------------------------------------------------------------------
-- 4. ПОЛИТИКИ  (idempotent: drop policy if exists → create)
--    Роль authenticated = вошедший (в т.ч. анонимно). anon без входа не видит ничего.
-- ---------------------------------------------------------------------------

-- team_sessions: пользователь видит только свою строку (пишется через redeem_code)
drop policy if exists ts_select on public.team_sessions;
create policy ts_select on public.team_sessions for select to authenticated
  using (user_id = auth.uid());

-- teams: своя команда | админ. (Рейтинг чужих команд — через get_rating(), не тут.)
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
  using (public.is_admin() or id = public.current_team_id());
drop policy if exists teams_admin_write on public.teams;
create policy teams_admin_write on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- games: видно всем вошедшим, КРОМЕ locked (будущие не утекают). Пишет только админ.
drop policy if exists games_select on public.games;
create policy games_select on public.games for select to authenticated
  using (public.is_admin() or status <> 'locked');
drop policy if exists games_admin_write on public.games;
create policy games_admin_write on public.games for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- cases: только для открытых игр (не locked). Пишет админ.
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.games g where g.id = cases.game_id and g.status <> 'locked')
  );
drop policy if exists cases_admin_write on public.cases;
create policy cases_admin_write on public.cases for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- roster: своя команда читает/редактирует; админ всё.
drop policy if exists roster_select on public.roster;
create policy roster_select on public.roster for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
drop policy if exists roster_write on public.roster;
create policy roster_write on public.roster for all to authenticated
  using (public.is_admin() or team_id = public.current_team_id())
  with check (public.is_admin() or team_id = public.current_team_id());

-- scores: своя команда только ЧИТАЕТ; пишет ТОЛЬКО админ (команда не поставит себе баллы).
drop policy if exists scores_select on public.scores;
create policy scores_select on public.scores for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
drop policy if exists scores_admin_write on public.scores;
create policy scores_admin_write on public.scores for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- answers: своя команда читает/сдаёт; админ всё.
drop policy if exists answers_select on public.answers;
create policy answers_select on public.answers for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
drop policy if exists answers_write on public.answers;
create policy answers_write on public.answers for all to authenticated
  using (public.is_admin() or team_id = public.current_team_id())
  with check (public.is_admin() or team_id = public.current_team_id());

-- messages: только свой чат (read + write). Изоляция по team_id из сессии.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (team_id = public.current_team_id());

-- admin_codes / (teams.code) напрямую не читаются никем, кроме админа — политик на select нет,
-- обмен кода идёт через SECURITY DEFINER redeem_code, который обходит RLS.

-- ---------------------------------------------------------------------------
-- 5. ГРАНТЫ + RPC
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- функции входа/рейтинга доступны и до привязки к команде
grant execute on function public.redeem_code(text)   to anon, authenticated;
grant execute on function public.get_rating()         to anon, authenticated;
grant execute on function public.current_team_id()    to authenticated;
grant execute on function public.is_admin()           to authenticated;

-- ---------------------------------------------------------------------------
-- 6. REALTIME для чата
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 7. СИДЫ: 7 игр + кейсы «Эмпатии» (совпадают с текущим сайтом)
-- ---------------------------------------------------------------------------
insert into public.games (id, num, week, title, skill, emoji, accent, status) values
  ('detective', 1, 1, 'Детектив КЦ',                'Найти боль клиента и решить в одном касании', '🕵️', '#ef3124', 'done'),
  ('noforward',  2, 2, 'Не перекладывай!',           'Взять проблему на себя, не переводить',       '🙅', '#f0782b', 'done'),
  ('iknow',      3, 3, 'Продуктовый «Я знаю всё»',   'Знание продуктов и регламентов',              '🧠', '#e8b21e', 'done'),
  ('empathy',    4, 4, 'Эмпатия в реальном времени', 'Услышать эмоцию раньше, чем ответить',        '💗', '#d6338f', 'current'),
  ('onecall',    5, 5, 'Один звонок — одно решение', 'Держать высокий FCR стабильно',               '🎯', '#8b46d6', 'locked'),
  ('captains',   6, 6, 'Битва капитанов',            'Капитан показывает всё на письме',            '⚔️', '#3f74e0', 'locked'),
  ('marathon',   7, 7, 'Альфа-марафон сезона',       'Финал: публичная аттестация площадки',        '🏁', '#1ea672', 'locked')
on conflict (id) do nothing;

insert into public.cases (game_id, ord, title, difficulty, body) values
  ('empathy', 1, 'Блокировка карты на кассе — публичный конфуз', 'Сложный',
   'Клиент звонит в панике: его карту заблокировали прямо на кассе при очереди. Считает это унизительным и грозится закрыть все счета.'),
  ('empathy', 2, 'Скрытая комиссия — «вы воры!»', 'Сложный',
   'Клиент заметил списание комиссии, о которой, по его словам, не предупреждали. Убеждён, что банк «тайно» снимает деньги.'),
  ('empathy', 3, 'Перевод завис на двое суток', 'Средний',
   'Клиент сделал срочный перевод родственнику — деньги не пришли уже двое суток. Нервничает, считает банк некомпетентным.')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 8. ДЕМО-КОМАНДА + АДМИН-КОД (для теста; в бою заменить, см. блок ниже)
-- ---------------------------------------------------------------------------
insert into public.teams (code, name, site, mentor, hue, coins)
  values ('KOYA-04', 'Эмпаты', 'Владимир', 'Иванов Иван', 210, 90)
  on conflict (code) do nothing;

insert into public.admin_codes (code, label) values ('ADMIN-DEMO-9F3A', 'Демо-админ')
  on conflict (code) do nothing;

-- Немного баллов демо-команде, чтобы было видно на доске
insert into public.scores (team_id, game_id, cases, bonus, super_bonus, fcr, feedback)
select t.id, 'detective', 8, 1, 0, 88, 'Сильный ответ по FCR.' from public.teams t where t.code = 'KOYA-04'
on conflict (team_id, game_id) do nothing;

-- ============================================================================
--  БОЕВЫЕ 30 КОМАНД (запускать ПОЗЖЕ, когда будут реальные названия/тренеры).
--  Коды — ВЫСОКОЭНТРОПИЙНЫЕ (KOYA-NN-<random>), их нельзя перебрать.
--  Пример генерации (раскомментируй и правь названия):
--
--  insert into public.teams (code, name, site, mentor, hue)
--  select
--    'KOYA-' || lpad(n::text,2,'0') || '-' || encode(gen_random_bytes(4),'hex'),
--    'Команда ' || n, null, null, (n*37) % 360
--  from generate_series(1,30) as n;
--
--  Потом открой Table Editor → teams, впиши реальные name/site/mentor,
--  и раздай каждой команде её полный code (с хвостом!).
-- ============================================================================
