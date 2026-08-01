// src/lib/scoring.ts
// ЕДИНЫЙ источник правды о том, что входит в сумму баллов команды.
//   total = cases + bonus + super_bonus_vok
// VOC — это процент (0..100), в сумму баллов не входит. Супер-бонус +3 даётся
// ТОЛЬКО за лучший VOC недели. Историческое поле super_bonus («за лучший FCR»)
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

/** Места в рейтинге по «спортивной» схеме: РАВНЫЕ суммы делят одно место, следующее
 *  идёт со сдвигом (7,5,5,3 → места 1,2,2,4).
 *
 *  Раньше место было просто индексом в отсортированном списке, то есть при одинаковых
 *  баллах порядок задавал алфавит: одна команда получала медаль и «Топ-3 сезона»,
 *  соседняя с тем же результатом — место ниже и ничего. Объяснить это участникам нечем.
 *
 *  Вход должен быть уже отсортирован по убыванию суммы (как отдаёт get_rating). */
export function assignRanks(totalsDesc: number[]): number[] {
  const ranks: number[] = []
  let rank = 0
  for (let i = 0; i < totalsDesc.length; i++) {
    if (i === 0 || totalsDesc[i] !== totalsDesc[i - 1]) rank = i + 1
    ranks.push(rank)
  }
  return ranks
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

/** Полная строка оценивания в админке (чекбоксы + числа + текст ОС + файл ОС).
 *  feedbackFile/Name — УЖЕ разрешённые значения (после загрузки нового файла в saveAll),
 *  сюда попадает либо ранее сохранённый путь, либо путь только что загруженного файла. */
export interface GradeFormRow {
  submitted: boolean
  cases: number
  bonus: boolean
  vok: number
  superBonusVok: boolean
  feedback: string
  feedbackFile: string | null
  feedbackFileName: string | null
}
/** Очки, реально записываемые в scores. */
export interface ScoreWrite {
  cases: number
  bonus: number
  vok: number
  superBonusVok: number
  feedback: string
  feedbackFile: string | null
  feedbackFileName: string | null
}
/** Перевод строки оценивания → запись в scores. «Не сдала» обнуляет ВСЮ строку
 *  (включая vok/feedback/файл ОС), «сдала» переводит галочки в веса. Вынесено из
 *  saveAll (Admin.tsx), чтобы путь записи в рейтинг покрывался тестами и совпадал с
 *  gradeTotal. Файл ОС обнуляем вместе с остальным: у «не сдавшей» команды не должно
 *  оставаться висящей ссылки на разбор — она бы показалась в кабинете без баллов. */
export function scoreWrite(g: GradeFormRow): ScoreWrite {
  if (!g.submitted) return { cases: 0, bonus: 0, vok: 0, superBonusVok: 0, feedback: '', feedbackFile: null, feedbackFileName: null }
  return {
    cases: g.cases,
    bonus: g.bonus ? BONUS_POINTS : 0,
    vok: g.vok,
    superBonusVok: g.superBonusVok ? SUPER_BONUS_VOK_POINTS : 0,
    feedback: g.feedback,
    feedbackFile: g.feedbackFile,
    feedbackFileName: g.feedbackFileName,
  }
}

/** Совпадают ли поля, которые реально уходят в scores.
 *
 *  Нужно, чтобы после сохранения снять «несохранено» ТОЛЬКО с тех команд, чьи значения
 *  не изменились, пока шли запросы. Раньше флаг снимался со всех команд батча — и правка,
 *  сделанная во время долгой заливки файла ОС, пропадала молча: в базу уходил старый балл,
 *  кнопка гасла со словом «сохранено», а фоновое обновление возвращало старое значение
 *  на экран. Сравниваем только то, что влияет на запись: pendingFile (ещё не загруженный
 *  файл) и служебные поля формы сюда намеренно не входят. */
export interface ComparableGrade {
  submitted: boolean
  cases: number
  bonus: boolean
  vok: number
  superBonusVok: boolean
  feedback: string
  // В состоянии админки поля файла необязательные — сравнение это допускает,
  // приводя отсутствие и null к одному и тому же «файла нет».
  feedbackFile?: string | null
  feedbackFileName?: string | null
}
export function sameScoreFields(
  a: ComparableGrade | undefined,
  b: ComparableGrade | undefined,
): boolean {
  if (!a || !b) return a === b
  return a.submitted === b.submitted
    && a.cases === b.cases
    && a.bonus === b.bonus
    && a.vok === b.vok
    && a.superBonusVok === b.superBonusVok
    && a.feedback === b.feedback
    && (a.feedbackFile ?? null) === (b.feedbackFile ?? null)
    && (a.feedbackFileName ?? null) === (b.feedbackFileName ?? null)
}
