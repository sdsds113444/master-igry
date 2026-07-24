-- ============================================================================
--  РЕДАКТИРОВАНИЕ СООБЩЕНИЙ В ЧАТЕ (как в мессенджерах) — 2026-07-23.
--  Применять ПОСЛЕ всех предыдущих миграций. Идемпотентно (можно повторно).
--
--  Что делает:
--    1) messages.user_id  — кто отправил (проставляет СЕРВЕР). Без него нельзя
--       достоверно ответить «это моё сообщение?» — до этой миграции сравнение
--       шло по подписи автора (тёзки в команде видели чужое как своё).
--    2) messages.edited_at — отметка «изменено» (null = не редактировалось).
--    3) RPC edit_message() — ЕДИНСТВЕННЫЙ путь правки. Прямой UPDATE из клиента
--       невозможен: на public.messages нет UPDATE-политики RLS, значит правка
--       через PostgREST отклоняется. Поэтому клиент физически не может подменить
--       author/sender_role/team_id — RPC меняет только text и edited_at.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Колонки.
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists user_id   uuid;
alter table public.messages add column if not exists edited_at timestamptz;

-- Старые сообщения остаются с user_id = null: их автора задним числом не
-- восстановить, поэтому они просто не редактируются (клиент не покажет карандаш).

-- ---------------------------------------------------------------------------
-- 2. user_id проставляет сервер, а не клиент (иначе можно прислать чужой uuid
--    и получить право правки чужого сообщения). Роль отправителя — как и было.
-- ---------------------------------------------------------------------------
create or replace function public.messages_set_sender() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  new.user_id := auth.uid();               -- всегда сервер, присланное игнорируем
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
-- 3. Серверный лимит длины сообщения (раньше был только клиентский maxLength).
--    NOT VALID: старые строки не сканируем, enforce — на новые и изменённые.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_text_len') then
    alter table public.messages
      add constraint messages_text_len check (char_length(text) <= 4000) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Правка сообщения.
--    Кто может:
--      • игрок  — только своё сообщение (user_id = auth.uid() И sender_role='player');
--        проверка роли обязательна: одна и та же анонимная сессия могла сначала
--        войти админ-кодом и написать от тренера, а потом кодом команды (redeem_code
--        перевешивает ту же строку team_sessions) — без неё игрок правил бы реплики
--        тренера, отправленные из этого же браузера;
--      • тренер — любое сообщение с sender_role='admin'. Учётка тренера общая,
--        и с другого устройства auth.uid() будет другой, а править свою же
--        реплику после пересадки за другой компьютер — нормальный сценарий.
--        Ровно это же правило зашито в computeCanEdit на клиенте, чтобы UI и сервер
--        не расходились (карандаш не появляется там, где сервер откажет).
--    Что меняется: ТОЛЬКО text и edited_at. Ни автор, ни роль, ни время
--    создания, ни команда не трогаются — «изменено» остаётся честной пометкой.
--    coalesce вокруг проверок — чтобы NULL (нет привязки к команде, нет auth.uid())
--    трактовался как «нельзя», а не проваливал `if not NULL` мимо запрета.
-- ---------------------------------------------------------------------------
create or replace function public.edit_message(p_message_id uuid, p_text text)
returns timestamptz
language plpgsql security definer set search_path = public as $fn$
declare
  v_msg  public.messages;
  v_text text := btrim(p_text);
  v_now  timestamptz := now();
begin
  if v_text = '' then raise exception 'empty_text'; end if;
  if char_length(v_text) > 4000 then raise exception 'text_too_long'; end if;

  select * into v_msg from public.messages where id = p_message_id;
  if not found then raise exception 'message_not_found'; end if;

  -- видимость канала: та же проверка, что в messages_select
  if not coalesce(public.is_admin() or v_msg.team_id = public.current_team_id(), false) then
    raise exception 'forbidden';
  end if;

  -- авторство
  if not coalesce(
    (v_msg.user_id is not null and auth.uid() is not null
      and v_msg.user_id = auth.uid() and v_msg.sender_role = 'player')
    or (public.is_admin() and v_msg.sender_role = 'admin'),
    false
  ) then
    raise exception 'forbidden';
  end if;

  update public.messages
     set text = v_text, edited_at = v_now
   where id = p_message_id;

  return v_now;
end
$fn$;

revoke all on function public.edit_message(uuid, text) from public;
grant execute on function public.edit_message(uuid, text) to authenticated;
