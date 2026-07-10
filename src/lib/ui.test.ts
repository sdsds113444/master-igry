import { describe, it, expect } from 'vitest'
import { rankTier, rankPercent, diffBadge, teamAvatar } from './ui'

describe('rankTier', () => {
  it('топ-3 — отдельный тир', () => {
    expect(rankTier(1).label).toBe('Топ-3 сезона')
    expect(rankTier(3).label).toBe('Топ-3 сезона')
  })
  it('топ-10 (кроме топ-3)', () => {
    expect(rankTier(4).label).toBe('В десятке лучших')
    expect(rankTier(10).label).toBe('В десятке лучших')
  })
  it('середина таблицы', () => {
    expect(rankTier(11).label).toBe('Крепкая середина')
    expect(rankTier(15).label).toBe('Крепкая середина')
  })
  it('нижняя половина', () => {
    expect(rankTier(16).label).toBe('Есть куда расти')
    expect(rankTier(30).label).toBe('Есть куда расти')
  })
})

describe('rankPercent', () => {
  it('1-е место — 100%', () => {
    expect(rankPercent(1)).toBe(100)
  })
  it('последнее место (30-е из 30) — 0%', () => {
    expect(rankPercent(30)).toBe(0)
  })
  it('монотонно убывает с ростом номера места', () => {
    expect(rankPercent(5)).toBeGreaterThan(rankPercent(15))
    expect(rankPercent(15)).toBeGreaterThan(rankPercent(25))
  })
  it('не выходит за 0..100 для мест за пределами диапазона', () => {
    expect(rankPercent(0)).toBeLessThanOrEqual(100)
    expect(rankPercent(100)).toBeGreaterThanOrEqual(0)
  })
  it('одна команда (total=1) → 100, без NaN', () => {
    expect(rankPercent(1, 1)).toBe(100)
    expect(Number.isNaN(rankPercent(1, 1))).toBe(false)
  })
})

describe('diffBadge (guard от null/неизвестной сложности)', () => {
  it('известная сложность → своя пара', () => {
    expect(diffBadge('Лёгкий')).toEqual({ bg: '#d8f5e6', fg: '#0f6b46' })
  })
  it('null/undefined/мусор → фолбэк-пара, не бросает', () => {
    const fallback = { bg: '#eef2f7', fg: '#334155' }
    expect(() => diffBadge(null)).not.toThrow()
    expect(diffBadge(null)).toEqual(fallback)
    expect(diffBadge(undefined)).toEqual(fallback)
    expect(diffBadge('внезапно')).toEqual(fallback)
  })
})

describe('teamAvatar', () => {
  it('hsl-пара для любого hue', () => {
    expect(teamAvatar(200)).toEqual({ bg: 'hsl(200 70% 92%)', fg: 'hsl(200 68% 24%)' })
  })
})
