# Миграции Supabase — порядок и «источник правды»

Миграции применялись к боевой базе по одной через Supabase MCP. Файлы здесь — для
воспроизводимости и истории. Некоторые функции переопределялись несколько раз
(`create or replace`), поэтому важно знать, **какая версия актуальна**.

## Порядок применения (на чистой базе)

1. `migration.sql` — таблицы, RLS-политики, базовые функции, сиды игр.
2. `migration_board.sql` — лента доски (`feed_items`) + `publish_game`.
3. `migration_feedback.sql` — форма обратной связи (`bug_reports`).
4. `migration_mentor_chat.sql` — канал чата (`channel`) + правка `messages_insert`.
5. `migration_hardening.sql` — анти-брутфорс, `sender_role`-триггер, уникальность кейсов.
6. `migration_vok.sql` — второй супер-бонус (VOC) + актуальный `get_rating`.
7. `migration_login_fixes.sql` — **актуальная версия `redeem_code`** (регистронезависимость + анти-брутфорс).
8. `cases.sql`, `cases-ul.sql` — сиды кейсов.
9. `migration_hardening_2.sql` — индексы под FK, лимит длины сообщения, `messages.user_id` (аддитивно, безопасно).
10. `migration_answers_storage.sql` — приватный бакет `answers` для файлов ответов + RLS.
11. `migration_case_images.sql`, `migration_cases_scale.sql` — картинки к кейсам, масштаб оценок.
12. `migration_review_fixes.sql` — фиксы кода-ревью (раздел A применён; раздел B закомментирован осознанно).
12a. `migration_review_fixes_applied_2026-07-10.sql` — **побеждающая версия `answers_write`**:
    ответ пишется только в ТЕКУЩУЮ игру и только до дедлайна. Здесь же появляется
    `games.deadline_at` и закрывается чтение кейсов от посетителей без кода команды.
    Файла не было в этом списке: восстановление базы строго по README дало бы систему,
    где приём ответов не закрывается никогда, а кейсы читает любой желающий.
13. `migration_reactions.sql` — реакции на сообщения (`message_reactions`).
14. `migration_prod_sync.sql` — досинхронизация репо с боем (лимит состава).
15. `migration_message_edit.sql` — **редактирование сообщений в чате**: `messages.user_id`,
    `messages.edited_at`, актуальная версия `messages_set_sender`, RPC `edit_message`.
16. `migration_hardening_3.sql` — лимиты длины (`answers.text` ≤ 50000, ФИО состава),
    `revoke execute get_rating from anon`, **`current_team_id` с проверкой `teams.is_active`**.
    Раньше файла не было в этом списке: восстановление базы по README вернуло бы
    `current_team_id` без учёта `is_active`, и отключённая команда мгновенно вернула бы
    доступ к кабинету, чату и праву писать ответы.
17. `migration_publish_deadline.sql` — **побеждающая версия `publish_game`** (авто-дедлайн
    «ближайшая пятница 13:00 МСК» + текст дедлайна из самой игры). Применять последней.
17a. `migration_feedback_file.sql` — файл разбора от тренера команде: колонки
    `scores.feedback_file`/`feedback_file_name` и ветка `is_admin` в политиках бакета.
    **Обязательно ДО пункта 18.** Если прогнать после, storage-политики откатятся к версии
    без окна приёма, и команда снова сможет подменить байты файла после дедлайна.
17b. `migration_answer_file_name.sql` — `answers.file_name`: исходное имя файла до
    транслитерации ключа в Storage (иначе команда видит у скрепки не то имя, что выбирала).
    Аддитивно, порядок среди пунктов 13–18 значения не имеет.
18. `migration_storage_window.sql` — Storage: команда пишет только свои ответы и только
    пока открыт приём; подпапка `feedback` (разбор от тренера) ей недоступна.
    Побеждает пункт 17a по политикам бакета — ветка `is_admin` в нём уже учтена.
19. `migration_cases_difficulty_not_null.sql` — `cases.difficulty` становится `NOT NULL`
    (в `migration_review_fixes.sql` пункт A4 был обёрнут в «exception when others then null»
    и молча не применился).
20. `migration_vok_scale.sql` — потолок `scores.vok` расширен со 100 до 999: VOC
    считается как процент выполнения плана и бывает выше сотки. Парная константа
    `VOK_MAX` в `src/pages/Admin.tsx` — числа обязаны совпадать.

⚠️ `migration_message_edit.sql` применять **после** `migration_hardening.sql`: тот
переопределяет `messages_set_sender()` в версии без `user_id`. Актуальная версия
триггера — в `migration_message_edit.sql`.

## Актуальная («побеждающая») версия каждой функции

- **`redeem_code`** → `migration_login_fixes.sql` (последняя по порядку; включает анти-брутфорс из `migration_hardening.sql` + регистронезависимость).
  Опциональное усиление (троттлинг по коду) — в `migration_hardening_optional.sql`.
- **`get_rating`** → `migration_vok.sql` (суммирует оба супер-бонуса; идентична версии в `migration.sql`).
- **`publish_game`** → `migration_publish_deadline.sql`. Версии в `migration_board.sql`,
  `migration_review_fixes.sql` и `migration_review_fixes_applied_2026-07-10.sql` **устарели**:
  в них нет авто-дедлайна, и повторный прогон через `create or replace` откатил бы прод —
  у опубликованной игры `deadline_at` остался бы NULL, а политика `answers_write` пускает
  запись при `deadline_at is null`, то есть приём ответов не закрылся бы никогда.
- **`is_admin`** → `migration.sql`.
- **`current_team_id`** → `migration_hardening_3.sql` (с проверкой `teams.is_active`).
  Версия в `migration.sql` устарела: она отдаёт `team_id` по `team_sessions` без учёта
  `is_active`, поэтому отключение скомпрометированной команды переставало работать.
- **`messages_set_sender`** → `migration_message_edit.sql` (проставляет `user_id`; версия в `migration_hardening.sql` его не знает).

## Опционально (применять вручную, меняет логику входа/политики)

`migration_hardening_optional.sql` — троттлинг `redeem_code` по коду, функциональные
индексы `upper(code)`, оптимизация RLS init-plan, заметка про multiple-permissive-политики.
Применять в спокойное окно, не на ходу во время игры.
