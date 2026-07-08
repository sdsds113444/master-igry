-- Реакции на сообщения чата (👍❤️😂🔥👏🎉), как в обычных мессенджерах.
-- ЕЩЁ НЕ ПРИМЕНЕНО К ПРОДУ — применять вручную через Supabase SQL Editor,
-- когда фронт с реакциями будет готов деплоиться. Безопасно повторно (idempotent).
--
-- team_id/channel денормализованы из родительского сообщения (не от клиента) —
-- тот же приём, что и у messages.user_id/sender_role (см. migration_review_fixes.sql):
-- BEFORE-триггер подставляет их из public.messages, RLS их же и проверяет, поэтому
-- клиент не может пририсовать реакцию в чужой чат, даже если подделает message_id
-- на существующее сообщение из другой команды — просто получит team_id чужой команды
-- и RLS-check его отсечёт.

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  team_id    uuid not null,
  channel    text not null,
  user_id    uuid not null,
  emoji      text not null check (emoji in ('👍','❤️','😂','🔥','👏','🎉')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);
create index if not exists message_reactions_team_channel_idx
  on public.message_reactions (team_id, channel, created_at);

alter table public.message_reactions enable row level security;

-- REPLICA IDENTITY FULL: без этого realtime DELETE-событие несёт в payload.old
-- только PK (id) — клиенту нужен ещё channel, чтобы отличить командный чат от
-- личного с тренером на одном team_id. Таблица маленькая, накладные расходы малы.
alter table public.message_reactions replica identity full;

-- Подставляет team_id/channel из родительского сообщения и user_id — сервер,
-- клиент не может подделать ни то, ни другое.
create or replace function public.message_reactions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg record;
begin
  select team_id, channel into v_msg
    from public.messages where id = new.message_id;
  if not found then
    raise exception 'message_not_found';
  end if;
  new.team_id := v_msg.team_id;
  new.channel := v_msg.channel;
  new.user_id := auth.uid();
  return new;
end
$$;

drop trigger if exists message_reactions_before on public.message_reactions;
create trigger message_reactions_before
  before insert on public.message_reactions
  for each row execute function public.message_reactions_before_insert();

-- select/insert: та же изоляция, что и у messages (своя команда или админ).
drop policy if exists message_reactions_select on public.message_reactions;
create policy message_reactions_select on public.message_reactions for select to authenticated
  using (public.is_admin() or team_id = public.current_team_id());

drop policy if exists message_reactions_insert on public.message_reactions;
create policy message_reactions_insert on public.message_reactions for insert to authenticated
  with check (public.is_admin() or team_id = public.current_team_id());

-- delete: снять можно только СВОЮ реакцию (toggle off).
drop policy if exists message_reactions_delete on public.message_reactions;
create policy message_reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = auth.uid());

do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null; end $$;
