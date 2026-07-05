// Общие UI-константы и формулы, чтобы не дублировать их по страницам.

/** Рейтинг героя (3..5 звёзд) по месту в общем зачёте из 30 команд.
 *  Раньше формула была скопирована в Board и TeamCabinet — теперь один источник.
 *  Знаменатель 29 (=30−1): места 1..30 — это 29 шагов, поэтому 1-е место даёт ровно
 *  5.0, а 30-е и хуже — 3.0 (при знаменателе 30 лидер получал бы 4.93 → «4.9»). */
export function heroStars(rank: number): number {
  return 3 + (Math.min(29, Math.max(0, 30 - rank)) / 29) * 2
}

/** Имя файла из пути хранилища ('team/game/отчёт.xlsx' → 'отчёт.xlsx').
 *  Раньше `split('/').pop()` был продублирован в db.ts, Admin и TeamCabinet. */
export function basename(path: string, fallback = 'файл'): string {
  return path.split('/').pop() || fallback
}

/** Дедлайн сдачи ответа недели. Один источник вместо трёх захардкоженных строк. */
export const DEADLINE = 'Пятница, 13:00 МСК'

/** Доступная метка сложности кейса: светлый тон-подложка + тёмный текст того же
 *  семейства. Раньше был белый текст на насыщенном фоне (1.9–3.1:1 — провал WCAG),
 *  теперь каждая пара ≥4.5:1. Ключи совпадают с SQL-констрейнтом cases.difficulty. */
export const DIFF_BADGE: Record<string, { bg: string; fg: string }> = {
  Лёгкий: { bg: '#d8f5e6', fg: '#0f6b46' }, // 5.64:1
  Средний: { bg: '#fff0c4', fg: '#8a5a00' }, // 5.23:1
  Сложный: { bg: '#ffe1dd', fg: '#c81e12' }, // 4.68:1
}

/** Метка сложности с защитой от неизвестного/пустого значения (в БД поле может
 *  оказаться null) — иначе `DIFF_BADGE[c.difficulty].bg` роняет рендер кейсов. */
export function diffBadge(difficulty: string | null | undefined): { bg: string; fg: string } {
  return (difficulty && DIFF_BADGE[difficulty]) || { bg: '#eef2f7', fg: '#334155' }
}

/** Аватар команды: светлая пастельная подложка + тёмный инициал того же тона.
 *  Раньше был белый текст на hsl(hue 70% 55%) — для жёлто-зелёных тонов это
 *  1.4–1.9:1. Теперь гарантированный контраст ≥5.5:1 для любого hue 0..360. */
export function teamAvatar(hue: number): { bg: string; fg: string } {
  return { bg: `hsl(${hue} 70% 92%)`, fg: `hsl(${hue} 68% 24%)` }
}

/** Появление карточек «снизу вверх» со сдвигом по индексу (лента игр/новостей). */
export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.5 } }),
}
