-- ============================================================================
--  ФАЙЛ ОБРАТНОЙ СВЯЗИ ОТ ТРЕНЕРА КОМАНДЕ — 2026-07-24.
--  Применять ПОСЛЕ всех предыдущих миграций. Идемпотентно (можно повторно).
--
--  Тренер в админке рядом с комментарием прикрепляет ОДИН файл (разбор кейсов),
--  команда качает его в кабинете. Файл кладётся в тот же приватный бакет 'answers',
--  но в подпапку команды: `<teamId>/<gameId>/feedback/<имя>`. Первый сегмент пути =
--  teamId, поэтому команда читает файл своей же read-политикой (folder[1]=team_id),
--  а новых прав на чтение не требуется.
--
--  Всё аддитивно: новые колонки + РАСШИРЕНИЕ политик (только добавляем ветку is_admin).
--  Ничего существующего не ломается — сдача ответов и оценивание работают как прежде.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Колонки под файл ОС в таблице scores (рядом с текстом feedback).
--    feedback_file      — путь объекта в бакете 'answers' (или NULL);
--    feedback_file_name — исходное имя файла для показа/скачивания (кириллица ок,
--                         в имени объекта она транслитерируется, а тут — как есть).
-- ---------------------------------------------------------------------------
alter table public.scores add column if not exists feedback_file      text;
alter table public.scores add column if not exists feedback_file_name text;

-- ---------------------------------------------------------------------------
-- 2. Разрешить АДМИНУ класть/обновлять файлы в бакете 'answers', но ТОЛЬКО в
--    подпапку `<teamId>/<gameId>/feedback/...` — не во всю папку команды.
--    Было: INSERT/UPDATE только самой командой (folder[1] = current_team_id).
--    У админа current_team_id() = NULL, поэтому он не мог загрузить файл вообще.
--    Добавляем ветку is_admin() С ОГРАНИЧЕНИЕМ folder[3] = 'feedback' (принцип
--    наименьших прав: тренер не должен иметь возможности перезаписать файл-ответ
--    команды, лежащий в `<teamId>/<gameId>/<имя>` без подпапки feedback).
--    Условие команды НЕ меняется — она пишет в любую свою папку как прежде.
-- ---------------------------------------------------------------------------
drop policy if exists answers_bucket_insert on storage.objects;
create policy answers_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'answers'
    and (
      (storage.foldername(name))[1] = public.current_team_id()::text
      or (public.is_admin() and (storage.foldername(name))[3] = 'feedback')
    )
  );

drop policy if exists answers_bucket_update on storage.objects;
create policy answers_bucket_update on storage.objects for update to authenticated
  using (
    bucket_id = 'answers'
    and (
      (storage.foldername(name))[1] = public.current_team_id()::text
      or (public.is_admin() and (storage.foldername(name))[3] = 'feedback')
    )
  )
  with check (
    bucket_id = 'answers'
    and (
      (storage.foldername(name))[1] = public.current_team_id()::text
      or (public.is_admin() and (storage.foldername(name))[3] = 'feedback')
    )
  );

-- Политики чтения (answers_bucket_read) и удаления (answers_bucket_delete) уже
-- содержат is_admin() (см. migration_answers_storage.sql / migration_review_fixes.sql A5),
-- поэтому их не трогаем — команда читает файл в своей папке, админ читает/удаляет любые.
