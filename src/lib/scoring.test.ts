import { describe, it, expect } from 'vitest'
import { teamTotal, gradeTotal, BONUS_POINTS, SUPER_BONUS_POINTS, SUPER_BONUS_VOK_POINTS } from './scoring'

describe('teamTotal', () => {
  it('суммирует кейсы + бонус + оба супер-бонуса (fcr/vok НЕ входят)', () => {
    expect(teamTotal({ cases: 20, bonus: 1, superBonus: 3, superBonusVok: 3 })).toBe(27)
  })
  it('ноль на пустых баллах', () => {
    expect(teamTotal({ cases: 0, bonus: 0, superBonus: 0, superBonusVok: 0 })).toBe(0)
  })
})

describe('gradeTotal', () => {
  it('не сдала → 0, несмотря на выставленные галочки', () => {
    expect(gradeTotal({ submitted: false, cases: 20, bonus: true, superBonus: true, superBonusVok: true })).toBe(0)
  })
  it('сдала → кейсы + веса включённых бонусов', () => {
    expect(gradeTotal({ submitted: true, cases: 10, bonus: true, superBonus: true, superBonusVok: false }))
      .toBe(10 + BONUS_POINTS + SUPER_BONUS_POINTS)
  })
  it('согласована с teamTotal при переводе галочек в очки', () => {
    expect(gradeTotal({ submitted: true, cases: 5, bonus: true, superBonus: false, superBonusVok: true }))
      .toBe(teamTotal({ cases: 5, bonus: BONUS_POINTS, superBonus: 0, superBonusVok: SUPER_BONUS_VOK_POINTS }))
  })
})
