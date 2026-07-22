import { describe, it, expect, beforeEach, vi } from 'vitest'

// Изолируем слой supabase: форсим мок-режим db.ts независимо от .env.local на машине —
// тест офлайновый и детерминированный, не ходит в живую базу.
vi.mock('./supabase', () => ({
  isSupabaseConfigured: false,
  supabase: null,
  requireClient: () => { throw new Error('no supabase in mock test') },
  toProxyUrl: (u: string) => u,
}))

import { resolveMyTeam } from './db'
import { TEAMS } from '../data/mock'

const SESSION_KEY = 'mi.session' // ключ локальной сессии (см. db.ts)

/** Мини-localStorage: в node-окружении vitest его нет, а getSession/setSession на нём. */
function fakeLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
  }
}

function setSession(s: Record<string, unknown>) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

describe('resolveMyTeam (самолечение рассинхрона анонимной сессии)', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = fakeLocalStorage()
  })

  it('админская сессия → admin (своего кабинета команды нет)', async () => {
    setSession({ teamId: null, code: '', role: 'admin', name: 'Админ', hue: 0 })
    expect(await resolveMyTeam()).toEqual({ status: 'admin' })
  })

  it('целая командная сессия → ok с этой командой', async () => {
    const t = TEAMS[0]
    setSession({ teamId: t.id, code: t.code, role: 'player', name: t.name, hue: t.hue })
    const res = await resolveMyTeam()
    expect(res.status).toBe('ok')
    if (res.status === 'ok') expect(res.team.id).toBe(t.id)
  })

  it('рассинхрон: код верный, но teamId устарел → перепривязка по коду → ok', async () => {
    const t = TEAMS[0]
    // teamId, которого нет среди команд → getMyTeam вернёт null (как RLS-промах в бою).
    // Код валидный → самолечение обязано перепривязать и вернуть настоящую команду.
    setSession({ teamId: 'STALE-ID', code: t.code, role: 'player', name: t.name, hue: t.hue })
    const res = await resolveMyTeam()
    expect(res.status).toBe('ok')
    if (res.status === 'ok') expect(res.team.id).toBe(t.id)
  })

  it('несуществующий код + устаревший teamId → перепривязка не удалась → broken', async () => {
    setSession({ teamId: 'STALE-ID', code: 'ZZZZ-99999', role: 'player', name: 'X', hue: 0 })
    expect(await resolveMyTeam()).toEqual({ status: 'broken' })
  })
})
