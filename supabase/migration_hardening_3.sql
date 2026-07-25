-- ============================================================================
--  ХАРДЕНИНГ ПО ИТОГАМ СТАРОГО РЕВЬЮ (5 июля) — применено 2026-07-25.
--  Три пункта, которые можно закрыть по ходу сезона без риска для игры.
--  Идемпотентно.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. СЕРВЕРНЫЕ ЛИМИТЫ ДЛИНЫ ТЕКСТА.
--    Раньше лимит был только в браузере (а у поля ответа — вообще никакого):
--    через API можно было записать текст любого размера.
--
--    ВАЖНО про величину лимита: на боевой базе САМЫЙ ДЛИННЫЙ реальный ответ —
--    16 988 символов. Поэтому 10–20 тысяч сломали бы живую работу команд.
--    Берём 50 000 (≈18 страниц): огромную вставку отсекает, нормальный ответ
--    по 10 кейсам — нет.
--
--    NOT VALID: старые строки не сканируем (они и так проходят), но все новые
--    и изменённые проверяются.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'answers_text_len') then
    alter table public.answers
      add constraint answers_text_len check (char_length(coalesce(text, '')) <= 50000) not valid;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'roster_full_name_len') then
    alter table public.roster
      add constraint roster_full_name_len check (char_length(full_name) between 1 and 120) not valid;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'bug_reports_len') then
    alter table public.bug_reports
      add constraint bug_reports_len check (
        char_length(did) <= 4000
        and char_length(coalesce(expected, '')) <= 4000
        and char_length(coalesce(got, '')) <= 4000
        and char_length(coalesce(device, '')) <= 500
      ) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. РЕЙТИНГ — ТОЛЬКО ВОШЕДШИМ.
--    Было: execute на get_rating() выдан роли anon, то есть названия команд,
--    площадки и очки читались вообще без входа, одним запросом с публичным ключом.
--    Все настоящие пользователи после redeem_code имеют роль authenticated
--    (проверено: has_function_privilege('authenticated', ...) = true),
--    поэтому доска НЕ пострадает — отвалится только чтение анонимом без входа.
-- ---------------------------------------------------------------------------
--    ВНИМАНИЕ: одного `revoke ... from anon` НЕ хватает. В ACL функции стояло
--    «=X/postgres» — это грант роли PUBLIC, и право приходило к anon через неё.
--    Поэтому забираем у PUBLIC и оставляем явный грант authenticated.
revoke execute on function public.get_rating() from anon;
revoke execute on function public.get_rating() from public;
grant  execute on function public.get_rating() to authenticated;

--    ЧЕСТНАЯ ГРАНИЦА: это закрывает чтение рейтинга «одним публичным ключом без
--    сессии». Тот, кто просто открыл сайт, получает анонимную auth-сессию с ролью
--    authenticated и рейтинг всё ещё прочитает. Полностью закрыть можно, добавив в
--    get_rating условие «есть привязка к команде», но тогда команда со слетевшей
--    сессией (частый случай в банковском периметре) увидит ПУСТУЮ доску вместо
--    рейтинга — это хуже, чем сама утечка неконфиденциальных очков. Не делаем.

-- ---------------------------------------------------------------------------
-- 3. ОТКЛЮЧЕНИЕ КОМАНДЫ ДОЛЖНО РАБОТАТЬ.
--    Было: is_active проверялся только при входе по коду, а RLS смотрела на
--    team_sessions, где привязка живёт вечно. Уже вошедшую команду отключить
--    было нельзя — она продолжала играть со старой сессией.
--    Стало: хелпер current_team_id() учитывает is_active, и снятие галочки
--    реально закрывает доступ (к ответам, чату, кейсам, файлам).
--
--    Безопасно: на момент применения все 29 команд is_active = true, NULL нет.
--    Админа это не затрагивает — у него team_id в team_sessions пустой,
--    и функция как возвращала NULL, так и возвращает.
-- ---------------------------------------------------------------------------
create or replace function public.current_team_id()
returns uuid language sql stable security definer set search_path = public as $fn$
  select ts.team_id
  from public.team_sessions ts
  join public.teams t on t.id = ts.team_id
  where ts.user_id = auth.uid() and t.is_active;
$fn$;
