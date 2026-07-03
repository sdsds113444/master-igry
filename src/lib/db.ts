// src/lib/db.ts
// Тонкий слой данных. Страницы вызывают ТОЛЬКО эти функции и не знают про supabase/мок.
// Каждая функция ветвится по isSupabaseConfigured:
//   false → демо-данные (src/data/mock.ts) — поведение как раньше, ничего не ломается.
//   true  → живая база Supabase (анонимный вход + привязка к команде по коду).
// Все функции async, чтобы сигнатуры не менялись при переключении режима.

import { isSupabaseConfigured, supabase, requireClient } from './supabase'
import {
  TEAMS, GAMES, FEED, ROSTER_SEED, TEAM_CHAT_SEED,
  type TeamScore, type CaseItem, type Game, type FeedItem,
} from '../data/mock'

export type Role = 'player' | 'admin'
export interface Session { teamId: string | null; code: string; role: Role; name: string; hue: number }
export interface ChatMsg { id: string; author: string; text: string; time: string; me: boolean; role: Role }
export interface RatingRow { id: string; rank: number; name: string; site: string; hue: number; total: number }
export interface TeamInfo {
  id: string; code: string; name: string; site: string; mentor: string; hue: number; coins: number
}
export interface AdminTeamRow { id: string; code: string; name: string; site: string; hue: number }
export interface GradeRow { cases: number; bonus: number; superBonus: number; fcr: number; feedback: string }

// Демо-код админки ТОЛЬКО для офлайн-режима (моки, без реальных данных).
// Боевой админ-код хранится в БД и НИКОГДА не попадает в репозиторий/бандл.
export const MOCK_ADMIN_CODE = 'DEMO-ADMIN'

/** Бросает ошибку supabase-js вместо молчаливого игнорирования { error }.
 *  Нужен, чтобы страницы могли откатить оптимистичный UI и показать сбой. */
function throwOn(error: unknown) {
  if (error) throw error
}

/** «Это моё сообщение?» — от роли текущей сессии, не от совпадения имени.
 *  Тренер (админ) считает своими сообщения с ролью admin; игрок — свои по подписи. */
function computeMe(author: string, role: Role): boolean {
  const ses = getSession()
  if (ses?.role === 'admin') return role === 'admin'
  return role !== 'admin' && author === getDisplayName()
}

// ---------- локальная «сессия» (какая команда сейчас вошла) ----------
const SESSION_KEY = 'mi.session'
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}
function setSession(s: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) }
export async function signOut() {
  localStorage.removeItem(SESSION_KEY)
  if (isSupabaseConfigured && supabase) await supabase.auth.signOut()
}

// ---------- имя, под которым человек пишет в чате (косметика, не защита) ----------
const NAME_KEY = 'mi.displayName'
export function getDisplayName(): string | null {
  return localStorage.getItem(NAME_KEY)
}
export function setDisplayName(name: string) {
  localStorage.setItem(NAME_KEY, name.trim())
}

// ---------- мок-хранилище в памяти (чтобы add/remove/send «жили» в демо) ----------
const mockRoster: Record<string, string[]> = {}
const mockChat: Record<string, ChatMsg[]> = {}
const mockSubs: Record<string, ((m: ChatMsg) => void)[]> = {}
const mockSubmissions: Record<string, { answer: string; fileName: string | null }> = {}

// ---------- анонимная сессия Supabase (нужна до redeem_code) ----------
async function ensureAnon() {
  const sb = requireClient()
  const { data } = await sb.auth.getSession()
  if (!data.session) await sb.auth.signInAnonymously()
}

// =====================================================================
// ВХОД ПО КОДУ
// =====================================================================
export async function signInByCode(code: string): Promise<Session | null> {
  const norm = code.trim().toUpperCase()

  if (!isSupabaseConfigured) {
    if (norm === MOCK_ADMIN_CODE) {
      const s: Session = { teamId: null, code: norm, role: 'admin', name: 'Админ', hue: 0 }
      setSession(s)
      return s
    }
    const t = TEAMS.find((x) => x.code === norm)
    if (!t) return null
    const s: Session = { teamId: t.id, code: t.code, role: 'player', name: t.name, hue: t.hue }
    setSession(s)
    return s
  }

  const sb = requireClient()
  await ensureAnon()
  const { data, error } = await sb.rpc('redeem_code', { p_code: norm })
  if (error || !data) return null

  const res = data as { role: Role; team?: TeamInfo }
  const s: Session =
    res.role === 'admin'
      ? { teamId: null, code: norm, role: 'admin', name: 'Админ', hue: 0 }
      : { teamId: res.team!.id, code: res.team!.code, role: 'player', name: res.team!.name, hue: res.team!.hue }
  setSession(s)
  return s
}

// =====================================================================
// КОМАНДА / СОСТАВ
// =====================================================================
export async function getMyTeam(): Promise<TeamInfo | null> {
  const ses = getSession()
  if (!ses || !ses.teamId) return null

  if (!isSupabaseConfigured) {
    const t = TEAMS.find((x) => x.id === ses.teamId)
    return t ? { id: t.id, code: t.code, name: t.name, site: t.site, mentor: t.mentor, hue: t.hue, coins: t.coins } : null
  }

  const sb = requireClient()
  const { data } = await sb.from('teams').select('id, code, name, site, mentor, hue, coins').eq('id', ses.teamId).maybeSingle()
  return (data as TeamInfo) ?? null
}

export async function getRoster(teamId: string): Promise<string[]> {
  if (!isSupabaseConfigured) {
    return mockRoster[teamId] ?? (mockRoster[teamId] = [...ROSTER_SEED])
  }
  const sb = requireClient()
  const { data } = await sb.from('roster').select('full_name').eq('team_id', teamId)
    .order('is_captain', { ascending: false }).order('ord')
  return (data ?? []).map((r) => r.full_name as string)
}

export async function addPlayer(teamId: string, name: string): Promise<void> {
  const n = name.trim()
  if (!n) return
  if (!isSupabaseConfigured) {
    ;(mockRoster[teamId] ??= [...ROSTER_SEED]).push(n)
    return
  }
  const { error } = await requireClient().from('roster').insert({ team_id: teamId, full_name: n, is_captain: false })
  throwOn(error)
}

export async function removePlayer(teamId: string, name: string): Promise<void> {
  if (!isSupabaseConfigured) {
    mockRoster[teamId] = (mockRoster[teamId] ?? []).filter((p) => p !== name)
    return
  }
  const { error } = await requireClient().from('roster').delete().eq('team_id', teamId).eq('full_name', name)
  throwOn(error)
}

// =====================================================================
// ЧАТ (realtime)
// =====================================================================
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

export type ChatChannel = 'team' | 'mentor'

export async function listMessages(teamId: string, channel: ChatChannel = 'team'): Promise<ChatMsg[]> {
  const key = `${teamId}:${channel}`
  if (!isSupabaseConfigured) {
    return mockChat[key] ?? (mockChat[key] = channel === 'team' ? TEAM_CHAT_SEED.map((m, i) => ({ id: 's' + i, role: 'player' as Role, ...m })) : [])
  }
  const sb = requireClient()
  // .limit — не тянем весь растущий чат целиком (последние 200 сообщений).
  const { data, error } = await sb.from('messages').select('*')
    .eq('team_id', teamId).eq('channel', channel).order('created_at', { ascending: false }).limit(200)
  throwOn(error)
  return (data ?? []).reverse().map((m) => {
    const role = ((m.sender_role as Role) ?? 'player')
    return {
      id: m.id as string,
      author: m.author as string,
      text: m.text as string,
      time: hhmm(m.created_at as string),
      role,
      me: computeMe(m.author as string, role),
    }
  })
}

export async function sendMessage(teamId: string, author: string, text: string, channel: ChatChannel = 'team'): Promise<void> {
  const t = text.trim()
  if (!t) return
  const key = `${teamId}:${channel}`
  if (!isSupabaseConfigured) {
    const role: Role = getSession()?.role === 'admin' ? 'admin' : 'player'
    const msg: ChatMsg = { id: 'm' + Math.random().toString(36).slice(2), author, text: t, time: 'только что', me: true, role }
    ;(mockChat[key] ??= []).push(msg)
    ;(mockSubs[key] ?? []).forEach((cb) => cb(msg))
    return
  }
  // author — только косметическая подпись игрока. Роль отправителя (тренер/игрок)
  // проставляет СЕРВЕР триггером по auth-сессии, клиент не может выдать себя за тренера.
  const { error } = await requireClient().from('messages').insert({ team_id: teamId, author, text: t, channel })
  throwOn(error)
}

/** Подписка на новые сообщения (командный чат или личный с тренером). Возвращает объект с .unsubscribe(). */
export function subscribeMessages(teamId: string, onMsg: (m: ChatMsg) => void, channel: ChatChannel = 'team'): { unsubscribe(): void } {
  const key = `${teamId}:${channel}`
  if (!isSupabaseConfigured) {
    ;(mockSubs[key] ??= []).push(onMsg)
    return {
      unsubscribe() {
        mockSubs[key] = (mockSubs[key] ?? []).filter((c) => c !== onMsg)
      },
    }
  }
  const sb = requireClient()
  // Уникальный topic на каждый вызов — иначе повторный вызов (напр. из-за
  // React StrictMode двойного монтирования эффекта в dev) создаёт второй канал
  // с тем же именем на том же сокете, и обе подписки начинают работать нестабильно.
  const topic = `chat-${key}-${Math.random().toString(36).slice(2)}`
  const ch = sb
    .channel(topic)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `team_id=eq.${teamId}` },
      (payload) => {
        const m = payload.new as { id: string; author: string; text: string; created_at: string; channel: ChatChannel; sender_role?: Role }
        if (m.channel !== channel) return
        const role = m.sender_role ?? 'player'
        onMsg({ id: m.id, author: m.author, text: m.text, time: hhmm(m.created_at), role, me: computeMe(m.author, role) })
      },
    )
    .subscribe()
  return {
    unsubscribe() {
      sb.removeChannel(ch)
    },
  }
}

// =====================================================================
// КЕЙСЫ ИГРЫ
// =====================================================================
export async function getCases(gameId: string): Promise<CaseItem[]> {
  if (!isSupabaseConfigured) {
    // Ленивый импорт: файл с 73 кейсами (~42 КБ) не попадает в главный бандл,
    // а подгружается только в демо-режиме, когда реально нужен.
    const { GAME_CASES } = await import('../data/cases')
    return GAME_CASES[gameId] ?? []
  }
  const sb = requireClient()
  const { data } = await sb.from('cases').select('id, title, difficulty, body').eq('game_id', gameId).order('ord')
  return (data ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    difficulty: c.difficulty as CaseItem['difficulty'],
    text: c.body as string,
  }))
}

// =====================================================================
// БАЛЛЫ / ОТВЕТЫ / ОЦЕНИВАНИЕ
// =====================================================================
export async function getScores(teamId: string): Promise<Record<string, TeamScore>> {
  if (!isSupabaseConfigured) {
    return TEAMS.find((t) => t.id === teamId)?.perGame ?? {}
  }
  const sb = requireClient()
  const { data } = await sb.from('scores').select('*').eq('team_id', teamId)
  const out: Record<string, TeamScore> = {}
  for (const r of data ?? []) {
    out[r.game_id as string] = {
      cases: r.cases as number,
      bonus: r.bonus as number,
      superBonus: r.super_bonus as number,
      fcr: r.fcr as number,
      feedback: (r.feedback as string) ?? undefined,
    }
  }
  return out
}

export async function getSubmission(teamId: string, gameId: string): Promise<{ answer: string; fileName: string | null } | null> {
  if (!isSupabaseConfigured) {
    return mockSubmissions[`${teamId}:${gameId}`] ?? null
  }
  const sb = requireClient()
  const { data } = await sb.from('answers').select('text, file_url').eq('team_id', teamId).eq('game_id', gameId).maybeSingle()
  return data ? { answer: (data.text as string) ?? '', fileName: (data.file_url as string) ?? null } : null
}

export interface SubmitInput { teamId: string; gameId: string; answer: string; fileName?: string | null }
export async function submitAnswer(input: SubmitInput): Promise<void> {
  if (!isSupabaseConfigured) {
    mockSubmissions[`${input.teamId}:${input.gameId}`] = { answer: input.answer, fileName: input.fileName ?? null }
    return
  }
  const { error } = await requireClient().from('answers').upsert(
    { team_id: input.teamId, game_id: input.gameId, text: input.answer, file_url: input.fileName ?? null },
    { onConflict: 'team_id,game_id' },
  )
  throwOn(error)
}

export interface GradeInput { teamId: string; gameId: string; cases: number; bonus: number; superBonus: number; fcr: number; feedback: string }
export async function gradeSubmission(input: GradeInput): Promise<void> {
  if (!isSupabaseConfigured) return
  const { error } = await requireClient().from('scores').upsert(
    {
      team_id: input.teamId, game_id: input.gameId,
      cases: input.cases, bonus: input.bonus, super_bonus: input.superBonus,
      fcr: input.fcr, feedback: input.feedback,
    },
    { onConflict: 'team_id,game_id' },
  )
  throwOn(error)
}

/** Пакетное сохранение баллов всей игры одним запросом (вместо 30 отдельных upsert). */
export async function gradeMany(inputs: GradeInput[]): Promise<void> {
  if (!isSupabaseConfigured || inputs.length === 0) return
  const rows = inputs.map((i) => ({
    team_id: i.teamId, game_id: i.gameId,
    cases: i.cases, bonus: i.bonus, super_bonus: i.superBonus,
    fcr: i.fcr, feedback: i.feedback,
  }))
  const { error } = await requireClient().from('scores').upsert(rows, { onConflict: 'team_id,game_id' })
  throwOn(error)
}

// =====================================================================
// РЕЙТИНГ (общая доска — видны все команды, только неконфиденциальные поля)
// =====================================================================
export async function listTeamsRating(): Promise<RatingRow[]> {
  if (!isSupabaseConfigured) {
    return TEAMS.map((t) => ({ id: t.id, rank: t.rank ?? 0, name: t.name, site: t.site, hue: t.hue, total: t.total }))
  }
  const sb = requireClient()
  const { data } = await sb.rpc('get_rating')
  return (data ?? []).map((t: { id: string; name: string; site: string; hue: number; total: number }, i: number) => ({
    id: t.id, rank: i + 1, name: t.name, site: t.site ?? '', hue: t.hue, total: Number(t.total),
  }))
}

// =====================================================================
// АДМИНКА
// =====================================================================
export async function listAllTeamsAdmin(): Promise<AdminTeamRow[]> {
  if (!isSupabaseConfigured) {
    return TEAMS.map((t) => ({ id: t.id, code: t.code, name: t.name, site: t.site, hue: t.hue }))
  }
  const sb = requireClient()
  const { data } = await sb.from('teams').select('id, code, name, site, hue').order('name')
  return (data as AdminTeamRow[]) ?? []
}

export async function getScoresForGame(gameId: string): Promise<Record<string, GradeRow>> {
  if (!isSupabaseConfigured) {
    const out: Record<string, GradeRow> = {}
    for (const t of TEAMS) {
      const s = t.perGame[gameId]
      if (s) out[t.id] = { cases: s.cases, bonus: s.bonus, superBonus: s.superBonus, fcr: s.fcr, feedback: s.feedback ?? '' }
    }
    return out
  }
  const sb = requireClient()
  const { data } = await sb.from('scores').select('*').eq('game_id', gameId)
  const out: Record<string, GradeRow> = {}
  for (const r of data ?? []) {
    out[r.team_id as string] = {
      cases: r.cases as number, bonus: r.bonus as number, superBonus: r.super_bonus as number,
      fcr: r.fcr as number, feedback: (r.feedback as string) ?? '',
    }
  }
  return out
}

// =====================================================================
// ИГРЫ СЕЗОНА + ЛЕНТА ДОСКИ + ПУБЛИКАЦИЯ (админ)
// =====================================================================
export async function getGames(): Promise<Game[]> {
  if (!isSupabaseConfigured) return GAMES
  const sb = requireClient()
  const { data } = await sb.from('games').select('id, num, week, title, skill, emoji, accent, status').order('num')
  return (data as Game[] | null)?.length ? (data as Game[]) : GAMES
}

/** Текущая игра недели: последняя (по номеру) в статусе 'current'; иначе первая незакрытая. */
export function pickCurrentGame(games: Game[]): Game {
  const current = games.filter((g) => g.status === 'current').sort((a, b) => b.num - a.num)
  return current[0] ?? games.find((g) => g.status !== 'done') ?? games[0]
}

export interface FeedRow { id: string; kind: FeedItem['kind']; title: string; text: string; date: string; emoji: string; gameId: string | null }

function feedDate(iso: string): string {
  return new Date(iso).toLocaleString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export async function listFeed(): Promise<FeedRow[]> {
  if (!isSupabaseConfigured) {
    return FEED.map((f) => ({ id: f.id, kind: f.kind, title: f.title, text: f.text, date: f.date, emoji: f.emoji, gameId: null }))
  }
  const sb = requireClient()
  const { data, error } = await sb.from('feed_items').select('*').order('created_at', { ascending: false }).limit(50)
  throwOn(error)
  return (data ?? []).map((f) => ({
    id: f.id as string,
    kind: f.kind as FeedItem['kind'],
    title: f.title as string,
    text: f.text as string,
    date: feedDate(f.created_at as string),
    emoji: f.emoji as string,
    gameId: (f.game_id as string) ?? null,
  }))
}

/** Опубликовать задание недели: игра → 'current', прошлые current → 'done', запись в ленту. Только админ. */
export async function publishGame(gameId: string): Promise<void> {
  if (!isSupabaseConfigured) return
  const { error } = await requireClient().rpc('publish_game', { p_game_id: gameId })
  throwOn(error)
}
