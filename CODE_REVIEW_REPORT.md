# Code Review Report

Проект: `master-igry`

Дата ревью: 2026-07-04

Проверки:
- `npm run lint` — прошло
- `npm test` — прошло, 14 тестов
- `npm run build` — прошло
- `npm audit` и `npm audit --omit=dev` — 0 уязвимостей

## Findings

### 1. `publish_game` может оставить несколько текущих игр

- Файл: `supabase/migration_board.sql:31`
- Критичность: high
- Категория: баг / логика

Проблема: `publish_game` переводит в `done` только игры со статусом `current` и `num < target.num`. Если админ случайно опубликует игру с меньшим номером, старая более поздняя `current` останется текущей. В итоге в базе может быть несколько игр со статусом `current`.

Почему это риск: `pickCurrentGame()` выбирает последнюю `current`, а UI и лента могут показывать не ту игру, которую админ только что опубликовал.

Фикс:

```sql
create or replace function public.publish_game(p_game_id text)
returns void language plpgsql security definer set search_path = public as $fn$
declare g public.games;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;

  select * into g from public.games where id = p_game_id;
  if not found then raise exception 'game_not_found'; end if;

  update public.games
  set status = case
    when id = p_game_id then 'current'
    when num < g.num then 'done'
    else 'locked'
  end,
  published_at = case when id = p_game_id then now() else published_at end;

  insert into public.feed_items (kind, emoji, title, text, game_id) values
    ('video', '🎬', 'Мультик недели ' || g.week || ' — «' || g.title || '»',
     'Новый эпизод КОЯ уже на доске! Смотрим до старта заданий.', g.id),
    ('task', '📩', 'Задания недели ' || g.week || ' разосланы',
     'Кейсы в кабинетах команд. Дедлайн — пятница, 13:00 МСК.', g.id);
end $fn$;
```

### 2. Команда может сдавать ответ для locked/future игр и после дедлайна

- Файлы: `supabase/migration.sql:270`, `src/lib/db.ts:447`
- Критичность: high
- Категория: безопасность / бизнес-логика

Проблема: RLS `answers_write` проверяет только `team_id`, но не статус игры и не дедлайн. Через API команда может сделать `upsert` в `answers` для любой игры, включая будущую locked-игру.

Почему это риск: клиентский UI скрывает будущие кейсы, но сервер разрешает запись. Это позволяет обходить правила соревнования.

Фикс: добавить в `games` дедлайн и ограничить RLS.

```sql
alter table public.games add column if not exists deadline_at timestamptz;

drop policy if exists answers_write on public.answers;
create policy answers_write on public.answers for all to authenticated
  using (
    public.is_admin()
    or (
      team_id = public.current_team_id()
      and exists (
        select 1 from public.games g
        where g.id = answers.game_id
          and g.status = 'current'
          and (g.deadline_at is null or now() <= g.deadline_at)
      )
    )
  )
  with check (
    public.is_admin()
    or (
      team_id = public.current_team_id()
      and exists (
        select 1 from public.games g
        where g.id = answers.game_id
          and g.status = 'current'
          and (g.deadline_at is null or now() <= g.deadline_at)
      )
    )
  );
```

### 3. Состав команды может менять любой участник с кодом

- Файлы: `supabase/migration.sql:253`, `src/pages/TeamCabinet.tsx:502`
- Критичность: high
- Категория: безопасность / авторизация

Проблема: интерфейс говорит, что состав редактирует капитан, но RLS разрешает `roster_write` любому пользователю текущей команды. Код команды фактически общий, значит любой вошедший может менять состав.

Почему это риск: участник может удалить людей из состава, добавить мусорные записи или стереть капитана.

Фикс: использовать серверную роль `captain` и проверять её в RLS.

```sql
create or replace function public.is_captain()
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.team_sessions
    where user_id = auth.uid()
      and role in ('captain', 'admin')
  );
$fn$;

drop policy if exists roster_write on public.roster;
create policy roster_write on public.roster for all to authenticated
  using (
    public.is_admin()
    or (team_id = public.current_team_id() and public.is_captain())
  )
  with check (
    public.is_admin()
    or (team_id = public.current_team_id() and public.is_captain())
  );
```

### 4. Антибрутфорс входа привязан только к анонимной сессии

- Файл: `supabase/migration_login_fixes.sql:26`
- Критичность: high
- Категория: безопасность

Проблема: лимит попыток `redeem_code` считает неудачи по `auth.uid()` анонимной сессии. Анонимную сессию можно пересоздавать, тем самым сбрасывая счётчик.

Почему это риск: если коды не достаточно длинные или где-то утекли шаблоны, перебор становится проще.

Фикс: применить логику из `migration_hardening_optional.sql`: хранить `code` в `redeem_attempts`, лимитировать попытки по коду и добавить rate limit на edge/server уровне.

### 5. Рейтинг доступен через `anon`

- Файлы: `supabase/migration.sql:183`, `supabase/migration.sql:292`
- Критичность: medium
- Категория: безопасность / доступ к данным

Проблема: `get_rating()` — `SECURITY DEFINER`, и execute выдан `anon`. Любой с публичным ключом проекта может получить список команд, площадки и очки без входа.

Почему это риск: данные рейтинга могут считаться внутренними. RLS на `teams` здесь не помогает, потому что функция выполняется с повышенными правами.

Фикс:

```sql
revoke execute on function public.get_rating() from anon;
grant execute on function public.get_rating() to authenticated;
```

Или внутри функции проверять наличие `auth.uid()`/строки в `team_sessions`.

### 6. Invite URL общего чата захардкожен в клиенте

- Файл: `src/pages/TeamCabinet.tsx:238`
- Критичность: medium
- Категория: безопасность / секреты

Проблема: ссылка на общий чат выглядит как invite/bearer URL и находится прямо в клиентском коде. Она попадёт в production bundle.

Почему это риск: любой, кто видит бандл или репозиторий, может использовать invite.

Фикс: вынести ссылку в конфиг Supabase или env, ротировать текущий invite, при возможности заменить на ссылку без bearer-токена или с ограничением доступа.

### 7. Можно отправить пустой ответ

- Файл: `src/pages/TeamCabinet.tsx:126`
- Критичность: medium
- Категория: баг / edge case

Проблема: `sendAnswer()` не проверяет, что есть текст ответа или файл. Пустая сдача создаёт строку в `answers`, а админка считает её сданным ответом.

Почему это риск: команды могут случайно или намеренно отмечаться как сдавшие без содержимого.

Фикс:

```tsx
const canSubmit = !!answer.trim() || !!file || !!fileAttached
if (!me || !current || sending || !canSubmit) return
```

И добавить DB check:

```sql
alter table public.answers
  add constraint answers_not_empty
  check (length(btrim(coalesce(text, ''))) > 0 or file_url is not null);
```

### 8. Загрузка админки без обработки ошибок

- Файлы: `src/pages/Admin.tsx:50`, `src/pages/Admin.tsx:57`
- Критичность: medium
- Категория: баг / async

Проблема: эффекты загрузки используют `getGames().then(...)` и `Promise.all(...)` без `catch/finally`. При сетевой ошибке или отказе RLS будет unhandled rejection, а UI может остаться на loader.

Фикс: добавить `loadError`, `try/catch/finally` и cleanup-флаг.

```tsx
useEffect(() => {
  let cancelled = false
  async function load() {
    setLoading(true)
    setSaveError('')
    try {
      const [ts, scores, ans] = await Promise.all([
        listAllTeamsAdmin(),
        getScoresForGame(gameId),
        getAnswersForGame(gameId),
      ])
      if (cancelled) return
      // set state
    } catch {
      if (!cancelled) setSaveError('Не удалось загрузить данные админки.')
    } finally {
      if (!cancelled) setLoading(false)
    }
  }
  if (gameId) void load()
  return () => { cancelled = true }
}, [gameId])
```

### 9. `FeedbackPanel.reload()` не ловит ошибки

- Файл: `src/pages/Admin.tsx:432`
- Критичность: medium
- Категория: баг / async

Проблема: `reload()` делает `setItems(await listFeedback())` без `try/catch`. Если запрос падает, панель отзывов зависает на spinner.

Фикс: добавить error-state и обработку.

```tsx
async function reload() {
  try {
    setFeedbackError('')
    setItems(await listFeedback())
  } catch {
    setItems([])
    setFeedbackError('Не удалось загрузить отзывы.')
  }
}
```

### 10. Удаление игрока идёт по имени, а не по `id`

- Файлы: `src/lib/db.ts:220`, `src/pages/TeamCabinet.tsx:477`
- Критичность: medium
- Категория: баг / данные

Проблема: `removePlayer` удаляет строки по `team_id` + `full_name`. Если в составе два человека с одинаковым именем, удалятся оба. UI-откат также фильтрует по имени.

Фикс: возвращать из `getRoster()` объекты `{ id, fullName, isCaptain }`, использовать `key={player.id}` и удалять по `id`.

```ts
const { error } = await requireClient()
  .from('roster')
  .delete()
  .eq('team_id', teamId)
  .eq('id', playerId)
```

Дополнительно можно добавить `unique(team_id, full_name)`, если дубли запрещены бизнесом.

### 11. Пользовательские тексты и файлы почти без серверных лимитов

- Файлы: `supabase/migration_feedback.sql:5`, `src/lib/db.ts:436`
- Критичность: medium
- Категория: безопасность / производительность

Проблема: для feedback, answers, author, roster names нет явных лимитов длины в БД. Размер файла и расширение проверяются только в UI.

Почему это риск: через API можно записывать очень большие тексты или загружать неожиданные типы файлов, что бьёт по storage, bandwidth и админскому UI.

Фикс:

```sql
alter table public.answers
  add constraint answers_text_len check (char_length(coalesce(text, '')) <= 20000);

alter table public.bug_reports
  add constraint bug_reports_text_len check (
    char_length(did) <= 4000
    and char_length(coalesce(expected, '')) <= 4000
    and char_length(coalesce(got, '')) <= 4000
    and char_length(coalesce(device, '')) <= 500
  );

alter table public.roster
  add constraint roster_full_name_len check (char_length(full_name) between 1 and 120);
```

Для файлов лучше добавить server-side проверку MIME/размера через Edge Function или storage policy pipeline.

### 12. `messages.user_id` можно подделать клиентом

- Файлы: `supabase/migration_hardening_2.sql:38`, `src/lib/db.ts:46`
- Критичность: medium
- Категория: баг / целостность данных

Проблема: `messages.user_id` имеет `default auth.uid()`, но клиент может явно передать другое значение при insert. Сейчас комментарий считает это косметикой, но поле используется для `computeMe()`.

Почему это риск: пользователь может повлиять на отображение "моё/не моё", а в будущем это поле легко начать использовать для более важных решений.

Фикс: в триггере принудительно ставить `user_id`.

```sql
create or replace function public.messages_set_sender() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  new.user_id := auth.uid();
  if public.is_admin() then
    new.sender_role := 'admin';
    new.author := coalesce(nullif(btrim(new.author), ''), 'Тренер');
  else
    new.sender_role := 'player';
  end if;
  return new;
end;
$fn$;
```

### 13. `cases.difficulty` может быть `NULL` и уронить UI

- Файлы: `supabase/migration.sql:66`, `src/pages/TeamCabinet.tsx:340`
- Критичность: medium
- Категория: баг / null edge case

Проблема: колонка `difficulty` имеет check, но не `not null`. UI обращается к `DIFF_BADGE[c.difficulty].bg`; если в БД попадёт `NULL`, будет runtime exception.

Фикс:

```sql
alter table public.cases
  alter column difficulty set not null;
```

И добавить клиентский fallback:

```tsx
const badge = DIFF_BADGE[c.difficulty] ?? { bg: '#eef2f7', fg: '#334155' }
```

### 14. Supabase proxy привязан к `*.vercel.app` и одному project ref

- Файлы: `src/lib/supabase.ts:37`, `vercel.json:4`
- Критичность: low
- Категория: качество / деплой-надёжность

Проблема: `proxyAvailable` включается только для `*.vercel.app`, а `vercel.json` и CSP захардкожены на `ozgpjiemwcgunhtlttob.supabase.co`.

Почему это риск: при custom domain или смене Supabase project ref fallback `/sb` перестанет работать.

Фикс: вынести project ref/host в deployment config, либо включать proxy для всех production-доменов, где существует rewrite.

### 15. `pickCurrentGame([])` типизирован как `Game`, но может вернуть `undefined`

- Файл: `src/lib/db.ts:561`
- Критичность: low
- Категория: баг / edge case

Проблема: функция возвращает `current[0] ?? games.find(...) ?? games[0]`. Для пустого массива это `undefined`, но тип обещает `Game`.

Фикс: изменить тип на `Game | null` и обработать пустой список в местах вызова.

```ts
export function pickCurrentGame(games: Game[]): Game | null {
  const current = games.filter((g) => g.status === 'current').sort((a, b) => b.num - a.num)
  return current[0] ?? games.find((g) => g.status !== 'done') ?? games[0] ?? null
}
```

## Summary

Всего найдено проблем: 15.

- critical: 0
- high: 4
- medium: 9
- low: 2

Чинить в первую очередь:

1. RLS для сдачи ответов: статус игры, дедлайн, запрет сдачи будущих игр.
2. `publish_game`, чтобы в БД не было нескольких `current`.
3. Права на редактирование roster: только капитан/админ.
4. Антибрутфорс входных кодов: лимит не только по анонимной сессии.

Общее состояние проекта хорошее: сборка, линт, тесты и audit проходят. Основные риски не синтаксические, а серверные правила доступа, edge cases и несколько async-путей в админке.
