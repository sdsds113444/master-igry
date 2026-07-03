-- ============================================================================
--  ХАРДЕНИНГ безопасности и целостности (по итогам senior-ревью).
--  Применять ПОСЛЕ migration.sql, migration_mentor_chat.sql, migration_board.sql.
--  Идемпотентно (можно повторно). Применяется к боевой БД через Supabase MCP.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Анти-брутфорс: троттлинг попыток обмена кода (redeem_code)
--    Раньше функция не ограничивала число попыток — короткие/последовательные
--    коды перебирались мгновенно. Теперь ≤5 неудач за 5 минут на сессию.
--    (Главная защита всё равно — ВЫСОКОЭНТРОПИЙНЫЕ коды; это второй рубеж
--     + журнал попыток, по которому виден всплеск перебора.)
-- ---------------------------------------------------------------------------
create table if not exists public.redeem_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  success      boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index if not exists redeem_attempts_user_idx
  on public.redeem_attempts (user_id, attempted_at desc);
alter table public.redeem_attempts enable row level security;
-- политик на select нет: таблица доступна только через SECURITY DEFINER redeem_code.

create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_team   public.teams;
  v_admin  public.admin_codes;
  v_uid    uuid := auth.uid();
  v_fails  int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- не больше 5 НЕУДАЧНЫХ попыток за 5 минут на одну сессию-пользователя
  select count(*) into v_fails from public.redeem_attempts
    where user_id = v_uid and success = false and attempted_at > now() - interval '5 minutes';
  if v_fails >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  -- админ-код? (регистронезависимо — фронт форсит toUpperCase, а коды генерируются lower-hex,
  -- см. migration_login_fixes.sql — актуальная версия redeem_code)
  select * into v_admin from public.admin_codes where upper(code) = upper(p_code) and is_active;
  if found then
    insert into public.redeem_attempts (user_id, success) values (v_uid, true);
    insert into public.team_sessions (user_id, team_id, role)
      values (v_uid, null, 'admin')
      on conflict (user_id) do update set team_id = null, role = 'admin';
    return jsonb_build_object('role', 'admin');
  end if;

  -- код команды?
  select * into v_team from public.teams where upper(code) = upper(p_code) and is_active;
  if not found then
    insert into public.redeem_attempts (user_id, success) values (v_uid, false);
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  insert into public.redeem_attempts (user_id, success) values (v_uid, true);
  insert into public.team_sessions (user_id, team_id, role)
    values (v_uid, v_team.id, 'player')
    on conflict (user_id) do update set team_id = v_team.id, role = 'player';

  return jsonb_build_object('role', 'player', 'team', to_jsonb(v_team));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Чат: роль отправителя проставляет СЕРВЕР, а не клиент.
--    Раньше author приходил из браузера — любой участник мог написать «от тренера».
--    Теперь sender_role выставляет триггер по auth-сессии: подделать роль нельзя.
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists sender_role text not null default 'player'
  check (sender_role in ('player','admin'));

create or replace function public.messages_set_sender() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if public.is_admin() then
    new.sender_role := 'admin';
    new.author := coalesce(nullif(btrim(new.author), ''), 'Тренер');
  else
    new.sender_role := 'player';
  end if;
  return new;
end;
$fn$;

drop trigger if exists messages_set_sender_trg on public.messages;
create trigger messages_set_sender_trg before insert on public.messages
  for each row execute function public.messages_set_sender();

-- триггер-функция не должна быть вызываема напрямую как RPC (только как триггер)
revoke execute on function public.messages_set_sender() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Кейсы: один источник строк на (игра, порядок, поток) — без тихих дублей.
--    Раньше не было уникального ключа: повторный/встречный прогон миграций мог
--    задвоить/подменить кейсы. track разделяет ФЛ (fl) и будущий ЮЛ (ul/acq).
-- ---------------------------------------------------------------------------
alter table public.cases add column if not exists track text not null default 'fl';

-- убрать возможные дубли перед добавлением уникального ключа
delete from public.cases a using public.cases b
  where a.ctid < b.ctid
    and a.game_id = b.game_id and a.ord = b.ord and a.track = b.track;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cases_game_ord_track_uniq') then
    alter table public.cases add constraint cases_game_ord_track_uniq unique (game_id, ord, track);
  end if;
end $$;
