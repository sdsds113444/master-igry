import { describe, it, expect } from 'vitest'
import { teamTotal, gradeTotal, BONUS_POINTS, SUPER_BONUS_VOK_POINTS } from './scoring'

describe('teamTotal', () => {
  it('суммирует кейсы + бонус + супер-бонус ВОК (проценты НЕ входят)', () => {
    // Максимум за игру по новой модели: 3 (кейсы) + 1 (бонус) + 3 (супер ВОК) = 7.
    expect(teamTotal({ cases: 3, bonus: 1, superBonusVok: 3 })).toBe(7)
  })
  it('ноль на пустых баллах', () => {
    expect(teamTotal({ cases: 0, bonus: 0, superBonusVok: 0 })).toBe(0)
  })
})

describe('gradeTotal', () => {
  it('не сдала → 0, несмотря на выставленные галочки', () => {
    expect(gradeTotal({ submitted: false, cases: 3, bonus: true, superBonusVok: true })).toBe(0)
  })
  it('сдала → кейсы + веса включённых бонусов', () => {
    expect(gradeTotal({ submitted: true, cases: 3, bonus: true, superBonusVok: false }))
      .toBe(3 + BONUS_POINTS)
  })
  it('согласована с teamTotal при переводе галочек в очки', () => {
    expect(gradeTotal({ submitted: true, cases: 2, bonus: true, superBonusVok: true }))
      .toBe(teamTotal({ cases: 2, bonus: BONUS_POINTS, superBonusVok: SUPER_BONUS_VOK_POINTS }))
  })
})
