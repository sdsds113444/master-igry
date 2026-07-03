import { describe, it, expect } from 'vitest'
import { heroStars } from './ui'

describe('heroStars', () => {
  it('всегда в диапазоне 3..5 для мест 1..30', () => {
    for (let rank = 1; rank <= 30; rank++) {
      const v = heroStars(rank)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(5)
    }
  })
  it('1 место — максимум звёзд', () => {
    expect(heroStars(1)).toBeGreaterThan(heroStars(2))
  })
  it('места хуже 30-го не опускают ниже 3', () => {
    expect(heroStars(100)).toBe(3)
  })
})
