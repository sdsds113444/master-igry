-- ============================================================================
--  ФАЙЛЫ ОТВЕТОВ КОМАНД → приватный Storage-бакет 'answers'.
--  Раньше клиент сохранял ТОЛЬКО имя файла (байты никуда не уходили) — тренер
--  не мог получить вложение. Теперь файл реально грузится в бакет, а в answers.file_url
--  хранится путь team_id/game_id/имя. Применяется к боевой БД через Supabase MCP.
--  Идемпотентно.
-- ============================================================================

-- Приватный бакет (public=false → доступ только по подписанной ссылке/через RLS).
insert into storage.buckets (id, name, public)
  values ('answers', 'answers', false)
  on conflict (id) do nothing;

-- RLS на storage.objects: команда пишет/читает файлы ТОЛЬКО в своей папке (team_id/*),
-- тренер (админ) читает любые. Путь: '<team_id>/<game_id>/<имя>' → foldername[1] = team_id.
drop policy if exists answers_bucket_read on storage.objects;
create policy answers_bucket_read on storage.objects for select to authenticated
  using (
    bucket_id = 'answers'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.current_team_id()::text
    )
  );

drop policy if exists answers_bucket_insert on storage.objects;
create policy answers_bucket_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'answers'
    and (storage.foldername(name))[1] = public.current_team_id()::text
  );

drop policy if exists answers_bucket_update on storage.objects;
create policy answers_bucket_update on storage.objects for update to authenticated
  using (
    bucket_id = 'answers'
    and (storage.foldername(name))[1] = public.current_team_id()::text
  )
  with check (
    bucket_id = 'answers'
    and (storage.foldername(name))[1] = public.current_team_id()::text
  );
