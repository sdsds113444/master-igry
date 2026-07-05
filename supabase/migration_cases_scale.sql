-- ============================================================================
--  Оценка за кейсы: единый общий балл 0..3 (решение созвона), раньше было 0..30.
--  Модель: не сумма по кейсам, а ОДНА оценка за ответ команды:
--    0 — не сдал · 1 — >3 ошибок · 2 — <3 ошибок · 3 — без ошибок.
--  Потолок за игру теперь: 3 (кейсы) + 1 (бонус) + 3 (супер FCR) + 3 (супер ВОК) = 10.
--  Идемпотентно. Применять к боевой БД через Supabase SQL Editor / MCP.
-- ============================================================================

-- 1) Снять старый диапазонный check на scores.cases (имя авто-сгенерировано при
--    create table, поэтому ищем по определению, а не по фиксированному имени).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.scores'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%cases%'
  loop
    execute format('alter table public.scores drop constraint %I', c.conname);
  end loop;
end $$;

-- 2) Подрезать возможные легаси-значения (тестовые баллы по старой шкале 0..30) до 3,
--    иначе новый constraint не добавится. На пустой/чистой базе — no-op.
update public.scores set cases = 3 where cases > 3;

-- 3) Поставить новый диапазон 0..3.
alter table public.scores add constraint scores_cases_check check (cases between 0 and 3);
