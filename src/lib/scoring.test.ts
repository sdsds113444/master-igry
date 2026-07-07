import { describe, it, expect } from 'vitest'
import { teamTotal, gradeTotal, BONUS_POINTS, SUPER_BONUS_POINTS, SUPER_BONUS_VOK_POINTS } from './scoring'

describe('teamTotal', () => {
  it('суммирует кейсы + бонус + оба супер-бонуса (vok НЕ входит)', () => {
    // Максимум за игру по новой модели: 3 (кейсы) + 1 + 3 + 3 = 10.
    expect(teamTotal({ cases: 3, bonus: 1, superBonus: 3, superBonusVok: 3 })).toBe(10)
  })
  it('ноль на пустых баллах', () => {
    expect(teamTotal({ cases: 0, bonus: 0, superBonus: 0, superBonusVok: 0 })).toBe(0)
  })
})

describe('gradeTotal', () => {
  it('не сдала → 0, несмотря на выставленные галочки', () => {
    expect(gradeTotal({ submitted: false, cases: 3, bonus: true, superBonus: true, superBonusVok: true })).toBe(0)
  })
  it('сдала → кейсы + веса включённых бонусов', () => {
    expect(gradeTotal({ submitted: true, cases: 3, bonus: true, superBonus: true, superBonusVok: false }))
      .toBe(3 + BONUS_POINTS + SUPER_BONUS_POINTS)
  })
  it('согласована с teamTotal при переводе галочек в очки', () => {
    expect(gradeTotal({ submitted: true, cases: 2, bonus: true, superBonus: false, superBonusVok: true }))
      .toBe(teamTotal({ cases: 2, bonus: BONUS_POINTS, superBonus: 0, superBonusVok: SUPER_BONUS_VOK_POINTS }))
  })
})
