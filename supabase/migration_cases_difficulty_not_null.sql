-- cases.difficulty → NOT NULL.
--
-- Пункт A4 старого код-ревью так и не применился: в migration_review_fixes.sql он обёрнут
-- в «exception when others then null», поэтому неудача прошла молча и колонка осталась
-- nullable. Заметить это было нечем: код объявляет поле обязательным union-типом
-- ('Лёгкий' | 'Средний' | 'Сложный', см. src/data/mock.ts) и приводит значение через
-- `as CaseItem['difficulty']`, то есть TypeScript считает NULL невозможным и не
-- предупредит. Кейс, добавленный через SQL Editor без difficulty, прошёл бы проверку
-- cases_difficulty_check (она проверяет только значение, NULL пропускает) и отрисовался
-- бы у 29 команд с пустым бейджем сложности.
--
-- Строк с NULL на момент применения: 0 из 73. Обёртки, глушащей ошибку, здесь намеренно
-- нет — если ограничение не встанет, это должно быть видно.

alter table public.cases alter column difficulty set not null;
