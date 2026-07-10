-- ============================================================================
--  ФИКСЫ КОД-РЕВЬЮ, ПРИМЕНЁННЫЕ НА ПРОД 2026-07-10 (через MCP, с проверкой).
--  Файл делает supabase/*.sql воспроизводимым == боевая база. Идемпотентно.
--  Источник обоснований — supabase/migration_review_fixes.sql (разделы A/B).
--  НЕ применяли осознанно: B3 (revoke get_rating from anon — ломает keep-warm),
--  B2 games/feed (роадмап публичен намеренно), B6 (хэш кодов — отдельной процедурой).
-- ============================================================================

-- B1: ответ можно писать только для ТЕКУЩЕЙ игры (и до дедлайна, если задан).
alter table public.games add column if not exists deadline_at timestamptz;
drop policy if exists answers_write on public.answers;
create policy answers_write on public.answers for all to authenticated
  using (
    public.is_admin()
    or (team_id = public.current_team_id()
        and exists (select 1 from public.games g
                    where g.id = answers.game_id and g.status = 'current'
                      and (g.deadline_at is null or now() <= g.deadline_at)))
  )
  with check (
    public.is_admin()
    or (team_id = public.current_team_id()
        and exists (select 1 from public.games g
                    where g.id = answers.game_id and g.status = 'current'
                      and (g.deadline_at is null or now() <= g.deadline_at)))
  );

-- A1: publish_game закрывает ЛЮБУЮ другую current (id <> целевой), не только num<.
create or replace function public.publish_game(p_game_id text)
returns void language plpgsql security definer set search_path = public as $fn$
declare g public.games;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.games set status = 'done' where status = 'current' and id <> p_game_id;
  update public.games set status = 'current', published_at = now()
    where id = p_game_id returning * into g;
  if not found then raise exception 'game_not_found'; end if;
  insert into public.feed_items (kind, emoji, title, text, game_id) values
    ('video','🎬','Мультик недели '||g.week||' — «'||g.title||'»',
     'Новый эпизод КОЯ уже на доске! Смотрим до старта заданий.', g.id),
    ('task','📩','Задания недели '||g.week||' разосланы',
     'Кейсы в кабинетах команд. Дедлайн — пятница, 15:00 МСК.', g.id);
end $fn$;

-- Кейсы — только вошедшим по коду/админу (было: любая authenticated-сессия).
drop policy if exists cases_select on public.cases;
create policy cases_select on public.cases for select to authenticated
  using (
    public.is_admin()
    or (public.current_team_id() is not null
        and exists (select 1 from public.games g where g.id = cases.game_id and g.status <> 'locked'))
  );

-- A5: удаление файлов ответов — своя папка команды или админ.
drop policy if exists answers_bucket_delete on storage.objects;
create policy answers_bucket_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'answers'
    and (public.is_admin() or (storage.foldername(name))[1] = public.current_team_id()::text)
  );

-- Триггер-функцию лимита состава нельзя вызывать напрямую как RPC (и у PUBLIC тоже).
revoke execute on function public.enforce_roster_limit() from public, anon, authenticated;

-- Серверный лимит длины сообщения (зеркалит клиентский maxLength=4000).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_text_len') then
    alter table public.messages add constraint messages_text_len check (char_length(text) <= 4000) not valid;
  end if;
end $$;
