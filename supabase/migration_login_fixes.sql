-- ============================================================================
--  Фиксы входа по коду (2026-07-03). Применены в проде через Supabase MCP,
--  дубль здесь для истории/локали. Итоговая (актуальная) версия redeem_code —
--  ниже; при новых правках редактировать именно этот файл + migration_hardening.sql.
-- ----------------------------------------------------------------------------
--  1) Регистронезависимое сравнение кодов: страница входа форсит toUpperCase(),
--     а высокоэнтропийные коды генерируются как lower-hex — без этого владелец
--     кода физически не мог ввести его с клавиатуры.
--  2) РЕГРЕССИЯ, тут же исправленная: при первой правке (только upper()-сравнение,
--     без анти-брутфорса) я по невнимательности переписал функцию с нуля и
--     потерял защиту redeem_attempts (<=5 неудач/5мин) из migration_hardening.sql.
--     Ниже — версия с ОБЕИМИ защитами.
-- ============================================================================
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

  select count(*) into v_fails from public.redeem_attempts
    where user_id = v_uid and success = false and attempted_at > now() - interval '5 minutes';
  if v_fails >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;

  select * into v_admin from public.admin_codes where upper(code) = upper(p_code) and is_active;
  if found then
    insert into public.redeem_attempts (user_id, success) values (v_uid, true);
    insert into public.team_sessions (user_id, team_id, role)
      values (v_uid, null, 'admin')
      on conflict (user_id) do update set team_id = null, role = 'admin';
    return jsonb_build_object('role', 'admin');
  end if;

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
