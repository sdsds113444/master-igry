-- Добавляет разделение чата на «командный» (channel='team') и «личный с тренером»
-- (channel='mentor'). Изоляция данных не меняется — видимость по-прежнему
-- определяется тем же правилом (своя команда или админ), просто внутри
-- уже разрешённых сообщений появляется деление на две ленты.
-- Применить: Supabase → SQL Editor → вставить → Run. Безопасно повторно (idempotent).

alter table public.messages
  add column if not exists channel text not null default 'team' check (channel in ('team', 'mentor'));

create index if not exists messages_team_channel_idx on public.messages (team_id, channel, created_at);

-- Фикс: раньше писать в чат могла ТОЛЬКО сама команда (team_id = свой team_id).
-- Админ (тренер) физически не мог отправить сообщение ни в один чат — нужен
-- явный OR is_admin(), иначе личный чат с тренером был бы односторонним.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_admin() or team_id = public.current_team_id());
