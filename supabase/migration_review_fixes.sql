-- ============================================================================
--  ФИКСЫ ПО ИТОГАМ ДВОЙНОГО КОД-РЕВЬЮ (2026-07-05).
--  Применять ПОСЛЕ всех предыдущих миграций. Идемпотентно (можно повторно).
--
--  Файл разбит на ДВА раздела:
--    A. БЕЗОПАСНЫЕ — аддитивные, не ломают вход/доступ активных пользователей.
--       Можно применять в любой момент.
--    B. МЕНЯЮЩИЕ ДОСТУП/ЛОГИКУ — применять ОСОЗНАННО, в спокойное окно, по одному
--       блоку. Каждый блок помечен и объяснён.
--
--  Применение: Supabase → SQL Editor → New query → вставить нужный раздел → Run.
-- ============================================================================


-- ============================================================================
--  РАЗДЕЛ A. БЕЗОПАСНЫЕ ФИКСЫ (аддитивные)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A1. publish_game: гарантия РОВНО ОДНОЙ игры со статусом 'current'.
--     Было: в 'done' переводились только current-игры с num < целевой. Если
--     опубликовать игру с МЕНЬШИМ номером, поздняя current оставалась current —
--     в БД оказывалось две 'current', и pickCurrentGame/лента показывали не ту.
--     Стало: любую другую current закрываем независимо от номера.
-- ---------------------------------------------------------------------------
create or replace function public.publish_game(p_game_id text)
returns void language plpgsql security definer set search_path = public as $fn$
declare g public.games;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  -- закрываем ЛЮБУЮ другую текущую игру (не только с меньшим номером)
  update public.games set status = 'done'
    where status = 'current' and id <> p_game_id;

  update public.games set status = 'current', published_at = now()
    where id = p_game_id returning * into g;

  if not found then raise exception 'game_not_found'; end if;

  insert into public.feed_items (kind, emoji, title, text, game_id) values
    ('video','🎬','Мультик недели '||g.week||' — «'||g.title||'»',
     'Новый эпизод КОЯ уже на доске! Смотрим до старта заданий.', g.id),
    ('task','📩','Задания недели '||g.week||' разосланы',
     'Кейсы в кабинетах команд. Дедлайн — пятница, 13:00 МСК.', g.id);
end $fn$;

-- ---------------------------------------------------------------------------
-- A2. Чат: user_id проставляет СЕРВЕР, а не клиент.
--     Было: messages.user_id имел default auth.uid(), но клиент мог передать
--     чужой user_id при insert и повлиять на «моё/не моё» (computeMe). Теперь
--     триггер принудительно перезаписывает user_id — подделать нельзя.
-- ---------------------------------------------------------------------------
create or replace function public.messages_set_sender() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  new.user_id := auth.uid();               -- всегда сервер, игнорируем присланное
  if public.is_admin() then
    new.sender_role := 'admin';
    new.author := coalesce(nullif(btrim(new.author), ''), 'Тренер');
  else
    new.sender_role := 'player';
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- A3. Серверные лимиты длины пользовательских текстов (через API можно было
--     записать гигантский текст в обход UI). NOT VALID: не сканируем старые
--     строки, но enforce на все новые/изменённые.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'answers_text_len') then
    alter table public.answers
      add constraint answers_text_len check (char_length(coalesce(text, '')) <= 20000) not valid;
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
-- A4. cases.difficulty NOT NULL (клиент обращался к DIFF_BADGE[difficulty].bg —
--     null уронил бы рендер кейсов; на клиенте уже добавлен фолбэк diffBadge()).
--     Сначала подчищаем возможные null, затем ставим NOT NULL.
-- ---------------------------------------------------------------------------
update public.cases set difficulty = 'Средний' where difficulty is null;
do $$ begin
  alter table public.cases alter column difficulty set not null;
exception when others then null; end $$;

-- ---------------------------------------------------------------------------
-- A5. DELETE-политика на бакет 'answers': раньше её не было — устаревшие файлы
--     нельзя было удалить, они копились и оставались читаемыми. Разрешаем удалять
--     свои файлы (в папке своей команды) и админу — любые.
-- ---------------------------------------------------------------------------
drop policy if exists answers_bucket_delete on storage.objects;
create policy answers_bucket_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'answers'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_team_id()::text
    )
  );


-- ============================================================================
--  РАЗДЕЛ B. МЕНЯЮЩИЕ ДОСТУП/ЛОГИКУ — ПРИМЕНЯТЬ ОСОЗНАННО, ПО ОДНОМУ БЛОКУ.
--  Тут правки, которые могут изменить поведение входа/видимости на живой базе
--  во время идущего сезона. Читайте комментарий к каждому блоку.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- B1. Сдача ответа только для ТЕКУЩЕЙ игры и до дедлайна (было: RLS проверяла
--     лишь team_id — команда могла через API сдать/переписать ответ для любой
--     игры, включая будущую locked, и после дедлайна). Чтение прошлых ответов
--     остаётся (его даёт отдельная answers_select).
--     ВНИМАНИЕ: пока deadline_at не заполнен — работает только проверка статуса
--     'current'; проставьте games.deadline_at, если нужен жёсткий дедлайн.
-- ---------------------------------------------------------------------------
-- alter table public.games add column if not exists deadline_at timestamptz;
--
-- drop policy if exists answers_write on public.answers;
-- create policy answers_write on public.answers for all to authenticated
--   using (
--     public.is_admin()
--     or (
--       team_id = public.current_team_id()
--       and exists (
--         select 1 from public.games g
--         where g.id = answers.game_id and g.status = 'current'
--           and (g.deadline_at is null or now() <= g.deadline_at)
--       )
--     )
--   )
--   with check (
--     public.is_admin()
--     or (
--       team_id = public.current_team_id()
--       and exists (
--         select 1 from public.games g
--         where g.id = answers.game_id and g.status = 'current'
--           and (g.deadline_at is null or now() <= g.deadline_at)
--       )
--     )
--   );

-- ---------------------------------------------------------------------------
-- B2. Контент (игры/кейсы/лента) — только вошедшим по коду, а не любому владельцу
--     publishable-ключа. Было: games/feed = using(true), cases = только статус —
--     аноним ДО ввода кода (ensureAnon создаёт сессию заранее) читал весь контент.
--     Стало: требуется привязка к команде (current_team_id) либо админ.
--     Проверьте, что никакой экран не читает игры/ленту ДО входа (сейчас — нет).
-- ---------------------------------------------------------------------------
-- drop policy if exists games_select on public.games;
-- create policy games_select on public.games for select to authenticated
--   using (public.is_admin() or public.current_team_id() is not null);
--
-- drop policy if exists cases_select on public.cases;
-- create policy cases_select on public.cases for select to authenticated
--   using (
--     public.is_admin()
--     or (
--       public.current_team_id() is not null
--       and exists (select 1 from public.games g where g.id = cases.game_id and g.status <> 'locked')
--     )
--   );
--
-- drop policy if exists feed_select on public.feed_items;
-- create policy feed_select on public.feed_items for select to authenticated
--   using (public.is_admin() or public.current_team_id() is not null);

-- ---------------------------------------------------------------------------
-- B3. Рейтинг (get_rating) — убрать доступ роли anon: сейчас список команд,
--     площадки и очки читаются вообще без входа (execute выдан anon). Все реальные
--     пользователи после redeem_code — уже 'authenticated', так что доска не
--     пострадает; отвалится только чтение рейтинга анонимом без входа.
-- ---------------------------------------------------------------------------
-- revoke execute on function public.get_rating() from anon;

-- ---------------------------------------------------------------------------
-- B4. Троттлинг входа ПО КОДУ (не только по анонимной сессии). Лимит «5 неудач/
--     5 мин» привязан к auth.uid(), а его клиент пересоздаёт (signOut +
--     signInAnonymously) и обнуляет счётчик. Лимит по коду так не сбросить.
--     Готовый блок — в supabase/migration_hardening_optional.sql (раздел 1);
--     примените его, если нужен этот рубеж. Главная защита — высокоэнтропийные коды.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- B5. Отзыв доступа деактивированной команды. Сейчас is_active проверяется только
--     в redeem_code/get_rating, а RLS смотрит на team_sessions (привязка живёт
--     вечно) — отключить уже вошедшую команду нельзя. Учитываем is_active в хелпере:
-- ---------------------------------------------------------------------------
-- create or replace function public.current_team_id()
-- returns uuid language sql stable security definer set search_path = public as $fn$
--   select ts.team_id
--   from public.team_sessions ts
--   join public.teams t on t.id = ts.team_id
--   where ts.user_id = auth.uid() and t.is_active;
-- $fn$;
-- -- Админа отзывают удалением его строки из team_sessions:
-- --   delete from public.team_sessions where role = 'admin' and user_id = '<uid>';

-- ---------------------------------------------------------------------------
-- B6. Коды входа хранятся открытым текстом (teams.code, admin_codes.code) — утечка
--     дампа/бэкапа компрометирует все входы. Полноценный переход на хэш — отдельная
--     аккуратная миграция (сравнение в redeem_code по digest, разовая перезапись
--     существующих кодов их хэшами, невозможность показать код обратно). НЕ делаем
--     здесь автоматически во время сезона. План:
--       1) create extension if not exists pgcrypto;  -- уже есть
--       2) alter table teams add column code_hash bytea;  update ... = digest(upper(code),'sha256');
--       3) переписать redeem_code на сравнение digest(upper(p_code),'sha256') = code_hash;
--       4) после проверки — обнулить teams.code/admin_codes.code.
--     Делать в спокойное окно, с бэкапом и проверкой входа тестовой командой.

-- ---------------------------------------------------------------------------
-- B7. Редактирование состава «только капитан». НЕ применяем «в лоб»: сейчас
--     redeem_code НИКОМУ не присваивает роль 'captain' (все игроки — 'player'),
--     поэтому политика roster_write с проверкой is_captain() ЗАБЛОКИРОВАЛА БЫ
--     редактирование состава ВСЕМ. Код команды общий — на входе капитана от
--     обычного участника не отличить. Если нужна эта роль — сперва вводится
--     механизм «капитана» (например, первый redeem кода команды → role='captain'),
--     и только потом RLS-ограничение. Пока: удаление игрока переведено на id строки
--     (в клиенте) — это убирает главный вред (случайное удаление тёзки/капитана).
-- ---------------------------------------------------------------------------
