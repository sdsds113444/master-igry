-- ============================================================================
--  ХАРДЕНИНГ (ОПЦИОНАЛЬНО — ПРИМЕНЯТЬ ВРУЧНУЮ И ОСОЗНАННО).
--  Здесь изменения, которые меняют ЛОГИКУ ВХОДА и/или RLS на живой базе.
--  Не применяются автоматически: на боевом сайте это делается в спокойное окно.
--  Каждый блок независим — можно применять по одному.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. redeem_code: троттлинг ещё и ПО КОДУ (не только по сессии).
--    Проблема: лимит «5 неудач/5мин» привязан к auth.uid() анонимной сессии,
--    а её клиент пересоздаёт (signOut + signInAnonymously) и обнуляет счётчик.
--    Лимит по коду сбросить так нельзя. + лёгкая ретенция журнала (без pg_cron).
--    ГЛАВНОЙ защитой остаётся ВЫСОКОЭНТРОПИЙНЫЙ код — это второй рубеж.
--    Компромисс: 20 неудач по одному коду за 15 мин временно блокируют ИМЕННО этот
--    код (теоретически кто-то может так «залочить» команду на 15 мин — для внутреннего
--    сервиса приемлемо; порог 20 не мешает обычным опечаткам).
-- ---------------------------------------------------------------------------
alter table public.redeem_attempts add column if not exists code text;

create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_team       public.teams;
  v_admin      public.admin_codes;
  v_uid        uuid := auth.uid();
  v_fails      int;
  v_code_fails int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- лёгкая уборка старого журнала (ретенция ~1 день), чтобы таблица не росла бесконечно
  delete from public.redeem_attempts where attempted_at < now() - interval '1 day';

  -- лимит по сессии: ≤5 неудач/5мин
  select count(*) into v_fails from public.redeem_attempts
    where user_id = v_uid and success = false and attempted_at > now() - interval '5 minutes';
  if v_fails >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  -- лимит по КОДУ: ≤20 неудач/15мин (нельзя сбросить пересозданием сессии)
  select count(*) into v_code_fails from public.redeem_attempts
    where lower(code) = lower(p_code) and success = false and attempted_at > now() - interval '15 minutes';
  if v_code_fails >= 20 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  -- админ-код?
  select * into v_admin from public.admin_codes where upper(code) = upper(p_code) and is_active;
  if found then
    insert into public.redeem_attempts (user_id, success, code) values (v_uid, true, p_code);
    insert into public.team_sessions (user_id, team_id, role)
      values (v_uid, null, 'admin')
      on conflict (user_id) do update set team_id = null, role = 'admin';
    return jsonb_build_object('role', 'admin');
  end if;

  -- код команды?
  select * into v_team from public.teams where upper(code) = upper(p_code) and is_active;
  if not found then
    insert into public.redeem_attempts (user_id, success, code) values (v_uid, false, p_code);
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  insert into public.redeem_attempts (user_id, success, code) values (v_uid, true, p_code);
  insert into public.team_sessions (user_id, team_id, role)
    values (v_uid, v_team.id, 'player')
    on conflict (user_id) do update set team_id = v_team.id, role = 'player';

  return jsonb_build_object('role', 'player', 'team', to_jsonb(v_team));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Функциональные индексы под сравнение upper(code) (advisor: seq scan).
--    Ничтожно на 30 строках, но корректно на будущее.
-- ---------------------------------------------------------------------------
create index if not exists teams_code_upper_idx       on public.teams (upper(code));
create index if not exists admin_codes_code_upper_idx  on public.admin_codes (upper(code));

-- ---------------------------------------------------------------------------
-- 3. RLS init-plan: auth.uid() → (select auth.uid()) в ts_select
--    (advisor: auth_rls_initplan). Семантически идентично, вычисляется один раз.
-- ---------------------------------------------------------------------------
drop policy if exists ts_select on public.team_sessions;
create policy ts_select on public.team_sessions for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Advisor multiple_permissive_policies (teams/scores/cases/roster/answers/
--    feed_items/games): политики «for all» на запись дублируют проверку и на SELECT.
--    Можно разделить на insert/update/delete (SELECT останется за *_select-политикой).
--    Это чисто перф-оптимизация на будущее; на 30 командах эффект незаметен, поэтому
--    оставляю НЕ применённым, чтобы не трогать рабочие политики на живой базе.
--    Пример для одной таблицы (при желании повторить для остальных):
--
--    drop policy if exists teams_admin_write on public.teams;
--    create policy teams_admin_insert on public.teams for insert to authenticated with check (public.is_admin());
--    create policy teams_admin_update on public.teams for update to authenticated using (public.is_admin()) with check (public.is_admin());
--    create policy teams_admin_delete on public.teams for delete to authenticated using (public.is_admin());
-- ---------------------------------------------------------------------------
