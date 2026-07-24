import { describe, it, expect } from 'vitest'
import { mergeChat, editedTs } from './chatMerge'
import type { ChatMsg } from './db'

const msg = (id: string, text: string, editedAt: string | null = null, me = false): ChatMsg => ({
  id, text, editedAt, me, author: 'Аня', time: '10:00', role: 'player', canEdit: me,
})

describe('editedTs (версия сообщения)', () => {
  it('неправленое — версия 0', () => {
    expect(editedTs({ editedAt: null })).toBe(0)
  })
  it('форматы «+00:00» и «Z» сравнимы между собой (лексикографически — нет)', () => {
    expect(editedTs({ editedAt: '2026-07-23T10:00:00+00:00' }))
      .toBe(editedTs({ editedAt: '2026-07-23T10:00:00Z' }))
  })
  it('мусор не даёт NaN', () => {
    expect(editedTs({ editedAt: 'не время' })).toBe(0)
  })
})

describe('mergeChat: дедуп и добавление', () => {
  it('новые сообщения дописываются в конец и попадают в fresh', () => {
    const cur = [msg('a', 'раз')]
    const { next, fresh } = mergeChat(cur, [msg('b', 'два')])
    expect(next.map((m) => m.id)).toEqual(['a', 'b'])
    expect(fresh.map((m) => m.id)).toEqual(['b'])
  })
  it('повторная доставка того же сообщения не двоит ленту', () => {
    const cur = [msg('a', 'раз')]
    const { next, fresh } = mergeChat(cur, [msg('a', 'раз')])
    expect(next).toBe(cur) // тот же массив — лишней перерисовки не будет
    expect(fresh).toEqual([])
  })
  it('дубли внутри одной пачки схлопываются', () => {
    const { next } = mergeChat([], [msg('a', 'раз'), msg('a', 'раз')])
    expect(next.map((m) => m.id)).toEqual(['a'])
  })
})

describe('mergeChat: правка сообщения', () => {
  it('тот же id с новым текстом обновляет строку НА МЕСТЕ, а не добавляет', () => {
    const cur = [msg('a', 'опечятка'), msg('b', 'потом')]
    const { next, fresh } = mergeChat(cur, [msg('a', 'опечатка', '2026-07-23T10:05:00Z')], 'update')
    expect(next.map((m) => m.text)).toEqual(['опечатка', 'потом'])
    expect(fresh).toEqual([]) // правка не «новое сообщение» — звука быть не должно
  })

  it('устаревший снимок НЕ откатывает уже показанную правку', () => {
    // ровно сценарий фоллбэк-опроса: тик стартовал до правки, ответ пришёл после
    const cur = [msg('a', 'исправлено', '2026-07-23T10:05:00+00:00')]
    const stale = [msg('a', 'опечятка', null)]
    const { next } = mergeChat(cur, stale)
    expect(next).toBe(cur)
    expect(next[0].text).toBe('исправлено')
  })

  it('более поздняя правка (чужая, с другого устройства) применяется', () => {
    const cur = [msg('a', 'первая правка', '2026-07-23T10:05:00Z')]
    const { next } = mergeChat(cur, [msg('a', 'вторая правка', '2026-07-23T10:07:00Z')])
    expect(next[0].text).toBe('вторая правка')
  })

  it('правка сообщения ЗА пределами загруженного окна не всплывает внизу ленты', () => {
    const cur = [msg('a', 'раз')]
    const { next, fresh } = mergeChat(cur, [msg('старое', 'правка', '2026-07-23T10:05:00Z')], 'update')
    expect(next).toBe(cur)
    expect(fresh).toEqual([])
  })

  it('в снимке истории (insert) незнакомый id — это всё-таки новое сообщение', () => {
    const cur = [msg('a', 'раз')]
    const { next, fresh } = mergeChat(cur, [msg('c', 'три')], 'insert')
    expect(next.map((m) => m.id)).toEqual(['a', 'c'])
    expect(fresh.map((m) => m.id)).toEqual(['c'])
  })

  it('пачка с правкой и новым сообщением разом обрабатывается корректно', () => {
    const cur = [msg('a', 'опечятка'), msg('b', 'потом')]
    const { next, fresh } = mergeChat(cur, [
      msg('a', 'опечатка', '2026-07-23T10:05:00Z'),
      msg('c', 'новое'),
    ])
    expect(next.map((m) => [m.id, m.text])).toEqual([['a', 'опечатка'], ['b', 'потом'], ['c', 'новое']])
    expect(fresh.map((m) => m.id)).toEqual(['c'])
  })

  it('исходный массив не мутируется', () => {
    const cur = [msg('a', 'опечятка')]
    const snapshot = [...cur]
    mergeChat(cur, [msg('a', 'опечатка', '2026-07-23T10:05:00Z')])
    expect(cur).toEqual(snapshot)
  })
})
