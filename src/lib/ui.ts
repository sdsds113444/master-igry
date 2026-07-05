// Общие UI-константы и формулы, чтобы не дублировать их по страницам.

/** Статус места в общем зачёте — понятная замена «рейтингу героя» в звёздах
 *  (звёзды путали: воспринимались как оценка 5/5, а не как место в таблице).
 *  Показываем прямо: число места + прогресс-бар «сколько прошли до топа» + короткий
 *  словесный статус. color — акцентный цвет тира (для прогресс-бара/текста). */
export interface RankTier { emoji: string; label: string; color: string }
export function rankTier(rank: number, total = 30): RankTier {
  if (rank <= 3) return { emoji: '🏆', label: 'Топ-3 сезона', color: 'var(--color-gold)' }
  if (rank <= 10) return { emoji: '🔥', label: 'В десятке лучших', color: 'var(--color-alfa)' }
  if (rank <= Math.ceil(total / 2)) return { emoji: '💪', label: 'Крепкая середина', color: 'var(--color-alfa)' }
  return { emoji: '📈', label: 'Есть куда расти', color: 'var(--color-ink-soft, #7a8291)' }
}

/** Прогресс «насколько близко к 1-му месту», в процентах: 1-е место → 100%,
 *  последнее (total-е) → 0%. Для прогресс-бара рядом с местом. */
export function rankPercent(rank: number, total = 30): number {
  const r = Math.min(total, Math.max(1, rank))
  return Math.round(((total - r) / (total - 1)) * 100)
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
