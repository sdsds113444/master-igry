import { describe, it, expect } from 'vitest'
import { teamTotal, gradeTotal, scoreWrite, BONUS_POINTS, SUPER_BONUS_VOK_POINTS } from './scoring'

describe('teamTotal', () => {
  it('суммирует кейсы + бонус + супер-бонус VOC (проценты НЕ входят)', () => {
    // Максимум за игру по новой модели: 3 (кейсы) + 1 (бонус) + 3 (супер VOC) = 7.
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

describe('scoreWrite (строка оценивания → запись в scores)', () => {
  const F = { feedbackFile: null, feedbackFileName: null }
  it('не сдала → всё обнуляется, включая vok, feedback и файл ОС', () => {
    expect(scoreWrite({ submitted: false, cases: 3, bonus: true, vok: 88, superBonusVok: true, feedback: 'ок', feedbackFile: 'p/f.pdf', feedbackFileName: 'f.pdf' }))
      .toEqual({ cases: 0, bonus: 0, vok: 0, superBonusVok: 0, feedback: '', feedbackFile: null, feedbackFileName: null })
  })
  it('сдала → галочки в веса, cases/vok/feedback как есть', () => {
    expect(scoreWrite({ submitted: true, cases: 2, bonus: true, vok: 75, superBonusVok: false, feedback: 'хорошо', ...F }))
      .toEqual({ cases: 2, bonus: BONUS_POINTS, vok: 75, superBonusVok: 0, feedback: 'хорошо', feedbackFile: null, feedbackFileName: null })
  })
  it('сдала → файл ОС сохраняется как есть (путь и имя)', () => {
    expect(scoreWrite({ submitted: true, cases: 1, bonus: false, vok: 60, superBonusVok: false, feedback: '', feedbackFile: 't/g/feedback/razbor.pdf', feedbackFileName: 'Разбор.pdf' }))
      .toEqual({ cases: 1, bonus: 0, vok: 60, superBonusVok: 0, feedback: '', feedbackFile: 't/g/feedback/razbor.pdf', feedbackFileName: 'Разбор.pdf' })
  })
  it('обе галочки при cases=3', () => {
    expect(scoreWrite({ submitted: true, cases: 3, bonus: true, vok: 90, superBonusVok: true, feedback: '', ...F }))
      .toEqual({ cases: 3, bonus: BONUS_POINTS, vok: 90, superBonusVok: SUPER_BONUS_VOK_POINTS, feedback: '', feedbackFile: null, feedbackFileName: null })
  })
  it('сумма записи согласована с gradeTotal', () => {
    const g = { submitted: true, cases: 2, bonus: true, vok: 50, superBonusVok: true, feedback: '', ...F }
    const w = scoreWrite(g)
    expect(w.cases + w.bonus + w.superBonusVok).toBe(gradeTotal(g))
  })
})

describe('gradeTotal (граничные комбинации с cases=0)', () => {
  it('только супер-бонус VOC → 3', () => {
    expect(gradeTotal({ submitted: true, cases: 0, bonus: false, superBonusVok: true })).toBe(3)
  })
  it('только бонус → 1', () => {
    expect(gradeTotal({ submitted: true, cases: 0, bonus: true, superBonusVok: false })).toBe(1)
  })
  it('обе галочки → 4', () => {
    expect(gradeTotal({ submitted: true, cases: 0, bonus: true, superBonusVok: true })).toBe(4)
  })
})
