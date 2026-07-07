// src/lib/scoring.ts
// ЕДИНЫЙ источник правды о том, что входит в сумму баллов команды.
// Должен совпадать с SQL-функцией get_rating (supabase/migration_vok.sql):
//   total = cases + bonus + super_bonus + super_bonus_vok
// ВОК — это процент (0..100), в сумму баллов не входит.
//
// Раньше эта формула была скопирована в 5 местах (SQL, mock.ts, TeamCabinet,
// две раскладки Admin). При добавлении ВОК-бонуса пришлось править все копии —
// классический источник рассинхрона рейтинга. Теперь клиентская сторона считает
// сумму только здесь.

/** Баллы уже в «очках» (как хранятся в БД). */
export interface ScoreParts {
  cases: number
  bonus: number
  superBonus: number
  superBonusVok: number
}

/** Веса бонусов при переводе «галочек» оценивания в очки — тоже один источник. */
export const BONUS_POINTS = 1
export const SUPER_BONUS_POINTS = 3
export const SUPER_BONUS_VOK_POINTS = 3

/** Сумма баллов команды за игру. Зеркалит SQL get_rating (vok исключён). */
export function teamTotal(s: ScoreParts): number {
  return s.cases + s.bonus + s.superBonus + s.superBonusVok
}

/** Состояние строки оценивания в админке (чекбоксы + число за кейсы). */
export interface GradeParts {
  submitted: boolean
  cases: number
  bonus: boolean
  superBonus: boolean
  superBonusVok: boolean
}

/** Сумма по «галочкам» оценивания. «Не сдала» → 0 (совпадает с тем, что реально
 *  сохраняется в saveAll — не сдала обнуляет всю строку). Переводит чекбоксы в очки. */
export function gradeTotal(g: GradeParts): number {
  if (!g.submitted) return 0
  return teamTotal({
    cases: g.cases,
    bonus: g.bonus ? BONUS_POINTS : 0,
    superBonus: g.superBonus ? SUPER_BONUS_POINTS : 0,
    superBonusVok: g.superBonusVok ? SUPER_BONUS_VOK_POINTS : 0,
  })
}
