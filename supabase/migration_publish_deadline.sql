-- ПОБЕЖДАЮЩАЯ версия publish_game. Применять ПОСЛЕ всех остальных файлов.
--
-- Зачем этот файл: боевая функция умеет то, чего нет ни в одной копии в репозитории —
-- сама выставляет дедлайн (ближайшая пятница 13:00 МСК), если он не задан, и берёт текст
-- дедлайна для ленты ИЗ игры, а не хардкодом. Старые определения лежат в
-- migration_board.sql, migration_review_fixes.sql и migration_review_fixes_applied_2026-07-10.sql;
-- любое из них при повторном прогоне мигаций затёрло бы прод через create or replace.
--
-- Чем это грозило: у опубликованной игры deadline_at остался бы NULL, а политика
-- answers_write пускает запись при «deadline_at is null» — приём ответов не закрылся бы
-- никогда. Плюс у команд пропал бы обратный отсчёт, а в ленте снова появилось бы «15:00»
-- вместо реальных 13:00 (рассинхрон двух дедлайнов уже чинили однажды).
--
-- Выгружено из прода: select pg_get_functiondef(oid) from pg_proc where proname='publish_game'.

create or replace function public.publish_game(p_game_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g public.games;
  v_msk timestamp;
  v_deadline_text text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  update public.games set status = 'done'
    where status = 'current' and id <> p_game_id;

  update public.games set status = 'current', published_at = now()
    where id = p_game_id returning * into g;

  if not found then raise exception 'game_not_found'; end if;

  -- Дедлайн недели: если не задан вручную — ближайшая пятница 13:00 МСК (правило сезона).
  -- Без него не работают ни плашка обратного отсчёта у команд, ни закрытие приёма ответов
  -- (RLS answers_write пускает ответ, пока now() <= deadline_at).
  if g.deadline_at is null then
    v_msk := now() at time zone 'Europe/Moscow';
    update public.games
      set deadline_at = (
        (date_trunc('day', v_msk) + interval '13 hours'
          + (((5 - extract(isodow from v_msk)::int + 7) % 7)) * interval '1 day')
        + case when ((5 - extract(isodow from v_msk)::int + 7) % 7) = 0
                    and v_msk > date_trunc('day', v_msk) + interval '13 hours'
               then interval '7 days' else interval '0 days' end
      ) at time zone 'Europe/Moscow'
      where id = g.id
      returning * into g;
  end if;

  -- Текст дедлайна берём ИЗ игры, а не хардкодим: раньше в ленте висело «15:00»,
  -- а в кабинете и правилах «13:00» — команды видели два разных дедлайна.
  v_deadline_text := case
    when g.deadline_at is null then 'Дедлайн — см. в кабинете команды.'
    else 'Дедлайн — ' ||
         to_char(g.deadline_at at time zone 'Europe/Moscow', 'DD.MM') || ', ' ||
         to_char(g.deadline_at at time zone 'Europe/Moscow', 'HH24:MI') || ' МСК.'
  end;

  insert into public.feed_items (kind, emoji, title, text, game_id) values
    ('video','🎬','Мультик недели '||g.week||' — «'||g.title||'»',
     'Новый эпизод КОЯ уже на доске! Смотрим до старта заданий.', g.id),
    ('task','📩','Задания недели '||g.week||' разосланы',
     'Кейсы в кабинетах команд. ' || v_deadline_text, g.id);
end $function$;
