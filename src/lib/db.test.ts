import { describe, it, expect } from 'vitest'
import { pickCurrentGame } from './db'
import type { Game } from '../data/mock'

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
