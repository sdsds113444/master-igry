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
13. `migration_reactions.sql` — реакции на сообщения (`message_reactions`).
14. `migration_prod_sync.sql` — досинхронизация репо с боем (лимит состава).
15. `migration_message_edit.sql` — **редактирование сообщений в чате**: `messages.user_id`,
    `messages.edited_at`, актуальная версия `messages_set_sender`, RPC `edit_message`.

⚠️ `migration_message_edit.sql` применять **после** `migration_hardening.sql`: тот
переопределяет `messages_set_sender()` в версии без `user_id`. Актуальная версия
триггера — в `migration_message_edit.sql`.

## Актуальная («побеждающая») версия каждой функции

- **`redeem_code`** → `migration_login_fixes.sql` (последняя по порядку; включает анти-брутфорс из `migration_hardening.sql` + регистронезависимость).
  Опциональное усиление (троттлинг по коду) — в `migration_hardening_optional.sql`.
- **`get_rating`** → `migration_vok.sql` (суммирует оба супер-бонуса; идентична версии в `migration.sql`).
- **`publish_game`** → применена ad-hoc версия из `migration_review_fixes.sql` (A1) + дедлайн из `games.deadline_at`.
- **`is_admin` / `current_team_id`** → `migration.sql`.
- **`messages_set_sender`** → `migration_message_edit.sql` (проставляет `user_id`; версия в `migration_hardening.sql` его не знает).

## Опционально (применять вручную, меняет логику входа/политики)

`migration_hardening_optional.sql` — троттлинг `redeem_code` по коду, функциональные
индексы `upper(code)`, оптимизация RLS init-plan, заметка про multiple-permissive-политики.
Применять в спокойное окно, не на ходу во время игры.
