import { describe, it, expect, beforeEach } from 'vitest'
import { setUnsavedWork, hasUnsavedWork } from './unsavedWork'

describe('unsavedWork', () => {
  beforeEach(() => setUnsavedWork(false))

  it('по умолчанию несохранённой работы нет', () => {
    expect(hasUnsavedWork()).toBe(false)
  })

  it('флаг поднимается и читается', () => {
    setUnsavedWork(true)
    expect(hasUnsavedWork()).toBe(true)
  })

  it('снимается обратно — иначе шапка спрашивала бы подтверждение там, где терять нечего', () => {
    setUnsavedWork(true)
    setUnsavedWork(false)
    expect(hasUnsavedWork()).toBe(false)
  })

  it('повторная установка того же значения ничего не ломает', () => {
    setUnsavedWork(true)
    setUnsavedWork(true)
    expect(hasUnsavedWork()).toBe(true)
    setUnsavedWork(false)
    setUnsavedWork(false)
    expect(hasUnsavedWork()).toBe(false)
  })
})
