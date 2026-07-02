-- Динамическая лента доски + публикация задания недели админом.
-- Применяется ПОСЛЕ migration.sql (нужна таблица games и функция is_admin).
-- Уже применено к боевой базе через Supabase MCP; файл — для воспроизводимости.

create table if not exists public.feed_items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'announce' check (kind in ('video','task','rating','announce')),
  title      text not null,
  text       text not null default '',
  emoji      text not null default '📣',
  game_id    text references public.games(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists feed_created_idx on public.feed_items (created_at desc);

alter table public.feed_items enable row level security;
drop policy if exists feed_select on public.feed_items;
create policy feed_select on public.feed_items for select to authenticated using (true);
drop policy if exists feed_admin_write on public.feed_items;
create policy feed_admin_write on public.feed_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.feed_items to authenticated;

-- Публикация игры недели: игра → 'current', прошлые current → 'done', запись в ленту. Только админ.
create or replace function public.publish_game(p_game_id text)
returns void language plpgsql security definer set search_path = public as $fn$
declare g public.games;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  update public.games set status = 'done'
    where status = 'current' and num < (select num from public.games where id = p_game_id);

  update public.games set status = 'current', published_at = now()
    where id = p_game_id returning * into g;

  if not found then raise exception 'game_not_found'; end if;

  insert into public.feed_items (kind, emoji, title, text, game_id) values
    ('video','🎬','Мультик недели '||g.week||' — «'||g.title||'»',
     'Новый эпизод КОЯ уже на доске! Смотрим до старта заданий.', g.id),
    ('task','📩','Задания недели '||g.week||' разосланы',
     'Кейсы в кабинетах команд. Дедлайн — пятница, 15:00 МСК.', g.id);
end $fn$;
grant execute on function public.publish_game(text) to authenticated;

-- стартовая лента (если пусто)
insert into public.feed_items (kind, emoji, title, text)
select v.kind, v.emoji, v.title, v.text from (values
  ('rating',  '📊', 'Рейтинг обновлён по итогам недели 3', '«Красные панды» вырвались вперёд. Смотрите таблицу справа.'),
  ('announce','🏆', 'Супер-бонус недели 3',               '+3 очка команде с лучшим FCR. Поздравляем!')
) as v(kind,emoji,title,text)
where not exists (select 1 from public.feed_items);

do $$ begin
  alter publication supabase_realtime add table public.feed_items;
exception when duplicate_object then null; end $$;
