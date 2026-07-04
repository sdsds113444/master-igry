import { describe, it, expect } from 'vitest'
import { pickCurrentGame, normalizeCode } from './db'
import type { Game } from '../data/mock'

describe('normalizeCode (устойчивость к мобильным клавиатурам)', () => {
  it('приводит к верхнему регистру', () => {
    expect(normalizeCode('koya-04')).toBe('KOYA-04')
  })
  it('en-dash/длинное тире → обычный дефис (автозамена iOS)', () => {
    expect(normalizeCode('KOYA–04')).toBe('KOYA-04') // – en dash
    expect(normalizeCode('KOYA—04')).toBe('KOYA-04') // — em dash
    expect(normalizeCode('KOYA−04')).toBe('KOYA-04') // − minus
  })
  it('выкидывает пробелы и невидимые символы', () => {
    expect(normalizeCode(' koya-04 ')).toBe('KOYA-04')
    expect(normalizeCode('KOYA -04')).toBe('KOYA-04') // nbsp
    expect(normalizeCode('KOYA-04​')).toBe('KOYA-04') // zero-width space
  })
})

const g = (id: string, num: number, status: Game['status']): Game => ({
  id, num, week: num, title: id, skill: '', emoji: '', accent: '', status,
})

describe('pickCurrentGame', () => {
  it('берёт последнюю по номеру среди статуса current', () => {
    expect(pickCurrentGame([g('a', 1, 'done'), g('b', 2, 'current'), g('c', 3, 'current')]).id).toBe('c')
  })
  it('если current нет — первую незакрытую (не done)', () => {
    expect(pickCurrentGame([g('a', 1, 'done'), g('b', 2, 'locked')]).id).toBe('b')
  })
  it('если все done — первую игру', () => {
    expect(pickCurrentGame([g('a', 1, 'done'), g('b', 2, 'done')]).id).toBe('a')
  })
})
