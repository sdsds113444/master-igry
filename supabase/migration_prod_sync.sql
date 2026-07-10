-- ============================================================================
--  СИНХРОНИЗАЦИЯ РЕПО С БОЕВОЙ БАЗОЙ (2026-07-10).
--  Read-only сверка прода (проект ozgpjiemwcgunhtlttob) показала правку, применённую
--  ad-hoc через MCP и отсутствовавшую в файлах миграций. Фиксируем её здесь, чтобы
--  supabase/*.sql совпадал с боем при чистом деплое. Идемпотентно.
--
--  ⚠️ РАСХОЖДЕНИЕ С README: migration_hardening_2.sql на проде НЕ применён —
--     колонки public.messages.user_id и constraint messages_text_len на боевой базе
--     НЕТ. Следствие: computeMe в проде сравнивает по подписи (тёзки видят чужое как
--     «своё» — косметика), и серверного лимита длины сообщения нет (только клиентский
--     maxLength=4000). При чистом деплое решите осознанно, применять ли hardening_2.
-- ============================================================================

-- Серверный лимит состава: не больше 10 игроков в команде. Клиент (TeamCabinet.tsx)
-- ловит 'roster_full' и показывает «В команде максимум 10 человек».
create or replace function public.enforce_roster_limit()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if (select count(*) from public.roster where team_id = NEW.team_id) >= 10 then
    raise exception 'roster_full' using hint = 'В команде максимум 10 человек.';
  end if;
  return NEW;
end
$fn$;

drop trigger if exists roster_limit on public.roster;
create trigger roster_limit before insert on public.roster
  for each row execute function public.enforce_roster_limit();

-- (опц. хардининг, на проде ПОКА не применён; advisor 0028/0029) закрыть прямой
-- RPC-вызов триггер-функции — вызывать её как RPC незачем:
-- revoke execute on function public.enforce_roster_limit() from anon, authenticated;
