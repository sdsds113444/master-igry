-- ============================================================================
--  ХАРДЕНИНГ 2 (по итогам второго senior-ревью). Только БЕЗОПАСНЫЕ, аддитивные
--  изменения — не меняют логику входа и RLS-политики. Применяется к боевой БД
--  через Supabase MCP. Идемпотентно (можно повторно).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Индексы под внешние ключи (advisor: unindexed_foreign_keys).
--    На 30 командах не критично, но убирает seq-scan при join/фильтре по FK.
-- ---------------------------------------------------------------------------
create index if not exists answers_game_idx        on public.answers (game_id);
create index if not exists scores_game_idx          on public.scores (game_id);
create index if not exists bug_reports_team_idx     on public.bug_reports (team_id);
create index if not exists feed_items_game_idx      on public.feed_items (game_id);
create index if not exists team_sessions_team_idx   on public.team_sessions (team_id);

-- ---------------------------------------------------------------------------
-- 2. Ограничение длины сообщения чата (было — только непустота).
--    NOT VALID: не сканируем старые строки, но enforce на все новые/изменённые.
--    Зеркалим maxLength=4000 на клиенте (ChatThread).
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_text_len') then
    alter table public.messages
      add constraint messages_text_len check (char_length(text) <= 4000) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Стабильный автор сообщения (для «моё сообщение?» на клиенте).
--    Раньше принадлежность считалась по подписи (author) — два игрока с одинаковым
--    именем видели сообщения друг друга как «свои». Теперь есть user_id.
--    DEFAULT auth.uid() проставляется сервером при вставке; старые строки = null
--    (клиент для них падает на сравнение по подписи — как раньше).
--    Подделка user_id клиентом влияет ТОЛЬКО на его собственный вид «моё/не моё»
--    (косметика): изоляция по team_id и роль отправителя обеспечиваются отдельно.
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists user_id uuid default auth.uid();
