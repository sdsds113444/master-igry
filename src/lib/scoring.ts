// src/lib/scoring.ts
// ЕДИНЫЙ источник правды о том, что входит в сумму баллов команды.
//   total = cases + bonus + super_bonus_vok
// ВОК — это процент (0..100), в сумму баллов не входит. Супер-бонус +3 даётся
// ТОЛЬКО за лучший ВОК недели. Историческое поле super_bonus («за лучший FCR»)
// больше не начисляется: в БД колонка осталась и всегда 0, поэтому SQL get_rating,
// где super_bonus ещё в сумме, даёт тот же итог (нулевое слагаемое).
//
// Формула живёт только здесь — чтобы клиент не расходился с рейтингом.

/** Баллы уже в «очках» (как хранятся в БД). */
export interface ScoreParts {
  cases: number
  bonus: number
  superBonusVok: number
}

/** Веса бонусов при переводе «галочек» оценивания в очки — тоже один источник. */
export const BONUS_POINTS = 1
export const SUPER_BONUS_VOK_POINTS = 3

/** Сумма баллов команды за игру. Зеркалит SQL get_rating (проценты не входят). */
export function teamTotal(s: ScoreParts): number {
  return s.cases + s.bonus + s.superBonusVok
}

/** Состояние строки оценивания в админке (чекбоксы + число за кейсы). */
export interface GradeParts {
  submitted: boolean
  cases: number
  bonus: boolean
  superBonusVok: boolean
}

/** Сумма по «галочкам» оценивания. «Не сдала» → 0 (совпадает с тем, что реально
 *  сохраняется в saveAll — не сдала обнуляет всю строку). Переводит чекбоксы в очки. */
export function gradeTotal(g: GradeParts): number {
  if (!g.submitted) return 0
  return teamTotal({
    cases: g.cases,
    bonus: g.bonus ? BONUS_POINTS : 0,
    superBonusVok: g.superBonusVok ? SUPER_BONUS_VOK_POINTS : 0,
  })
}
