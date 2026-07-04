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

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const url = rawUrl?.replace(/\/+$/, '')

/** true → есть валидные env, работаем на живой базе. false → остаёмся на моках. */
export const isSupabaseConfigured: boolean = Boolean(url && anonKey)

// Обход блокировок *.supabase.co (мобильные операторы РФ режут прямые соединения
// с зарубежными облаками: сайт с Vercel открывается, а fetch к supabase.co умирает —
// «не удалось подключиться» на входе только с телефона). Запасной канал: свой же
// домен, /sb/* → Vercel rewrite → Supabase. Раз сайт догрузился — домен сайта
// доступен, значит доступна и база через него.
//
// ВАЖНО: через прокси НЕ ходим все поголовно — Supabase считает лимиты auth по IP,
// а у прокси один общий egress-IP Vercel на всех (30 анонимных входов/час на IP —
// массовый заход выбил бы лимит). Поэтому: одна быстрая проба прямого пути на
// сессию → у кого supabase.co доступен, ходят напрямую (как раньше); у кого сеть
// его режет — все запросы уходят через /sb. Реальные запросы никогда не
// повторяются автоматически (нет риска задвоить POST).
//
// Realtime (wss://) так проксировать нельзя (Vercel rewrites не переносят
// WebSocket) — он остаётся прямым, а для чата в db.ts есть polling-фолбэк.
// На localhost (dev/preview) маршрута /sb нет — всегда напрямую.
const proxyAvailable =
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  window.location.hostname.endsWith('.vercel.app') // прод-домен и preview-деплои; при переезде на свой домен — расширить условие

type Transport = 'direct' | 'proxy'
const TRANSPORT_KEY = 'mi.sbTransport'
function readSavedTransport(): Transport | null {
  try {
    const v = sessionStorage.getItem(TRANSPORT_KEY)
    return v === 'direct' || v === 'proxy' ? v : null
  } catch { return null }
}
let transport: Transport | null = proxyAvailable ? readSavedTransport() : 'direct'
let probing: Promise<Transport> | null = null

function setTransport(t: Transport) {
  transport = t
  try { sessionStorage.setItem(TRANSPORT_KEY, t) } catch { /* приватный режим и т.п. */ }
}

/** Одна проба на сессию: доступен ли supabase.co напрямую. Заблокированное
 *  соединение обычно ВИСНЕТ, а не падает — поэтому жёсткий таймаут 4 с. */
function resolveTransport(): Promise<Transport> {
  if (transport) return Promise.resolve(transport)
  probing ??= (async () => {
    try {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: anonKey! },
        signal: ctrl.signal,
      })
      window.clearTimeout(timer)
      setTransport(res.ok ? 'direct' : 'proxy')
    } catch {
      setTransport('proxy')
    }
    return transport!
  })()
  return probing
}

// Пробу запускаем сразу при старте приложения (не дожидаясь первого запроса) —
// к моменту, когда человек ввёл код и нажал «Войти», канал уже выбран.
if (isSupabaseConfigured && proxyAvailable && !transport) void resolveTransport()

/** Абсолютный URL supabase.co → same-origin /sb/… (когда сессия на прокси-канале).
 *  Нужен и для signed-URL из Storage — их открывают отдельной ссылкой, мимо fetch клиента. */
export function toProxyUrl(u: string): string {
  if (transport !== 'proxy' || !url || !u.startsWith(url)) return u
  return `${window.location.origin}/sb${u.slice(url.length)}`
}

/** fetch для supabase-js: сперва решаем канал (одна проба на сессию), дальше либо
 *  прямой fetch как раньше, либо тот же запрос на /sb. Без автоповторов. */
const smartFetch: typeof fetch = async (input, init) => {
  const t = await resolveTransport()
  if (t === 'direct') {
    try {
      return await fetch(input, init)
    } catch (e) {
      // Прямой путь отвалился посреди сессии (сменилась сеть?) — следующая
      // проба заново решит канал; текущий запрос честно падает без повтора.
      transport = null
      probing = null
      try { sessionStorage.removeItem(TRANSPORT_KEY) } catch { /* ignore */ }
      throw e
    }
  }
  const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const proxied = toProxyUrl(target)
  if (proxied === target) return fetch(input, init)
  // Request-объект пересоздаём на новом URL — метод/заголовки/тело сохраняются
  return input instanceof Request ? fetch(new Request(proxied, input), init) : fetch(proxied, init)
}

/** Клиент создаётся только когда сконфигурирован, иначе null. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, proxyAvailable ? { global: { fetch: smartFetch } } : undefined)
  : null

/** Гарантированно ненулевой клиент внутри supabase-веток db.ts. */
export function requireClient(): SupabaseClient {
  if (!supabase) throw new Error('Supabase не сконфигурирован (нет VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).')
  return supabase
}
