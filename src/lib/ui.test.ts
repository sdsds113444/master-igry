import { describe, it, expect } from 'vitest'
import { rankTier, rankPercent } from './ui'

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
})
