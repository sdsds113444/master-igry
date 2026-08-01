-- Storage: команда пишет только СВОИ ответы и только пока открыт приём.
--
-- Две дыры, найденные контрольным ревью перед публикацией игры 3.
--
-- 1) Подмена файла после дедлайна.
--    RLS таблицы answers закрывает запись по окончании приёма, а у политик storage.objects
--    условия окна не было вообще — проверялся только первый сегмент пути. Команда могла до
--    дедлайна сдать заглушку, а после — заменить БАЙТЫ файла тем же ключом: answers.file_url,
--    file_name и submitted_at при этом не менялись, и в админке признака дописывания не было
--    ни одного. Хватало собственного анонимного JWT из localStorage.
--
-- 2) Порча файла обратной связи.
--    Ограничение было односторонним: админу подпапку сузили до 'feedback', а команде оставили
--    «любая своя папка» — включая ту же feedback. Путь команде известен, он приходит ей в
--    scores.feedback_file. То есть участник мог перезаписать или удалить разбор, который
--    тренер положил ЕЙ ЖЕ, а восстановить его нечем.
--
-- Ветку is_admin() намеренно не трогаем: тренер обязан класть разбор ПОСЛЕ дедлайна.
-- Путь: <teamId>/<gameId>/<файл> для ответов и <teamId>/<gameId>/feedback/<файл> для ОС.
--
-- Совместимость: приложение никогда не вызывает storage.remove() (проверено по коду),
-- поэтому ужесточение DELETE ничего не ломает в штатном сценарии.

-- Общее условие «это своя папка команды, не feedback, и приём ещё открыт».
create or replace function public.team_may_write_answer_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select (storage.foldername(p_name))[1] = public.current_team_id()::text
     and coalesce((storage.foldername(p_name))[3], '') <> 'feedback'
     and exists (
       select 1 from public.games g
        where g.id = (storage.foldername(p_name))[2]
          and g.status = 'current'
          and (g.deadline_at is null or now() <= g.deadline_at)
     );
$$;

drop policy if exists answers_bucket_insert on storage.objects;
create policy answers_bucket_insert on storage.objects for insert
  with check (
    bucket_id = 'answers'
    and (
      public.team_may_write_answer_file(name)
      or (public.is_admin() and (storage.foldername(name))[3] = 'feedback')
    )
  );

drop policy if exists answers_bucket_update on storage.objects;
create policy answers_bucket_update on storage.objects for update
  using (
    bucket_id = 'answers'
    and (
      public.team_may_write_answer_file(name)
      or (public.is_admin() and (storage.foldername(name))[3] = 'feedback')
    )
  );

drop policy if exists answers_bucket_delete on storage.objects;
create policy answers_bucket_delete on storage.objects for delete
  using (
    bucket_id = 'answers'
    and (public.is_admin() or public.team_may_write_answer_file(name))
  );

-- Чтение НЕ трогаем: команда должна видеть и свой ответ, и свой файл обратной связи
-- в любое время, в том числе после закрытия недели.
