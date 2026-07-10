import { describe, it, expect } from 'vitest'
import { pickCurrentGame, normalizeCode, computeMe } from './db'
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

describe('normalizeCode (кириллические омоглифы)', () => {
  it('транслитерирует К/О/… с русской раскладки в латиницу', () => {
    expect(normalizeCode('КОYA-04')).toBe('KOYA-04') // К, О — кириллица
    expect(normalizeCode('КОУА-04')).toBe('KOYA-04') // весь префикс кириллицей
  })
})

const g = (id: string, num: number, status: Game['status']): Game => ({
  id, num, week: num, title: id, skill: '', emoji: '', accent: '', status,
})

describe('pickCurrentGame', () => {
  it('берёт последнюю по номеру среди статуса current', () => {
    expect(pickCurrentGame([g('a', 1, 'done'), g('b', 2, 'current'), g('c', 3, 'current')])?.id).toBe('c')
  })
  it('если current нет — null (закрытую игру не выдаём за активную)', () => {
    expect(pickCurrentGame([g('a', 1, 'done'), g('b', 2, 'locked')])).toBeNull()
  })
  it('все игры locked (до старта сезона) — null', () => {
    expect(pickCurrentGame([g('a', 1, 'locked'), g('b', 2, 'locked')])).toBeNull()
  })
  it('все done (пауза между неделями) — null', () => {
    expect(pickCurrentGame([g('a', 1, 'done'), g('b', 2, 'done')])).toBeNull()
  })
  it('на пустом списке возвращает null (без TypeError у вызывающих)', () => {
    expect(pickCurrentGame([])).toBeNull()
  })
})

describe('computeMe (моё/чужое сообщение)', () => {
  const admin = { isAdmin: true, uid: 'a1', displayName: null }
  const player = { isAdmin: false, uid: 'u1', displayName: 'Аня' }

  it('админ считает своими только admin-сообщения', () => {
    expect(computeMe(admin, 'Тренер', 'admin', 'a1')).toBe(true)
    expect(computeMe(admin, 'Аня', 'player', 'u9')).toBe(false)
  })
  it('для игрока admin-сообщение всегда чужое', () => {
    expect(computeMe(player, 'Тренер', 'admin', 'x')).toBe(false)
  })
  it('игрок: своё по стабильному user_id, а не по подписи', () => {
    expect(computeMe(player, 'кто угодно', 'player', 'u1')).toBe(true)
    expect(computeMe(player, 'Аня', 'player', 'u2')).toBe(false) // тёзка, другой uid
  })
  it('legacy без user_id → фолбэк по подписи (тёзки помечаются своими)', () => {
    expect(computeMe(player, 'Аня', 'player', null)).toBe(true)
    expect(computeMe(player, 'Боря', 'player', null)).toBe(false)
  })
})
