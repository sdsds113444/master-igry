// src/lib/supabase.ts
// Единая точка создания клиента Supabase.
//
// Если переменных окружения нет — isSupabaseConfigured === false, и весь слой
// данных (src/lib/db.ts) остаётся на моках (src/data/mock.ts). Приложение НЕ падает.
// Это защищает живой сайт: пока переменные не заданы в Vercel — сайт работает на демо.
//
// anon/publishable-ключ публичный и попадает в бандл — это нормально. Настоящую
// защиту данных обеспечивают RLS-политики на стороне Supabase, а не секретность ключа.
// service_role / secret-ключ в клиент НИКОГДА не кладём.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** true → есть валидные env, работаем на живой базе. false → остаёмся на моках. */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey)

/** Клиент создаётся только когда сконфигурирован, иначе null. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : null

/** Гарантированно ненулевой клиент внутри supabase-веток db.ts. */
export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase не сконфигурирован (нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  return supabase
}
