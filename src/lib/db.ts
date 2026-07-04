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
export interface GradeRow { cases: number; bonus: number; superBonus: number; fcr: number; vok: number; superBonusVok: number; feedback: string }

// Демо-код админки ТОЛЬКО для офлайн-режима (моки, без реальных данных).
// Боевой админ-код хранится в БД и НИКОГДА не попадает в репозиторий/бандл.
export const MOCK_ADMIN_CODE = 'DEMO-ADMIN'

/** Ошибка входа: слишком много попыток (троттлинг redeem_code). Отличаем от неверного кода. */
export class TooManyAttemptsError extends Error {
  constructor() { super('too_many_attempts') }
}

/** Бросает ошибку supabase-js вместо молчаливого игнорирования { error }.
 *  Нужен, чтобы страницы могли откатить оптимистичный UI и показать сбой. */
function throwOn(error: unknown) {
  if (error) throw error
}

/** «Это моё сообщение?» — по стабильному auth-id, а не по совпадению подписи.
 *  Тренер (админ) считает своими сообщения с ролью admin; игрок — свои по user_id
 *  (падает на сравнение по подписи только для старых сообщений без user_id). */
function computeMe(author: string, role: Role, userId?: string | null): boolean {
  const ses = getSession()
  if (ses?.role === 'admin') return role === 'admin'
  if (role === 'admin') return false
  const myUid = getMyUid()
  if (myUid && userId) return userId === myUid
  return author === getDisplayName()
}

// ---------- локальная «сессия» (какая команда сейчас вошла) ----------
const SESSION_KEY = 'mi.session'
const UID_KEY = 'mi.uid'
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}
function setSession(s: Session) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) }

/** Стабильный id текущей анонимной auth-сессии (для «моё сообщение»). */
export function getMyUid(): string | null {
  return localStorage.getItem(UID_KEY)
}
function setMyUid(uid: string | null) {
  if (uid) localStorage.setItem(UID_KEY, uid)
  else localStorage.removeItem(UID_KEY)
}

export async function signOut() {
  localStorage.removeItem(SESSION_KEY)
  localStorage.removeItem(UID_KEY)
  if (isSupabaseConfigured && supabase) await supabase.auth.signOut()
}

/** Если локальная сессия «висит», а анонимной auth-сессии уже нет (истекла/очищена),
 *  разлогиниваем — иначе пользователь застревает залогиненным с пустыми данными.
 *  Возвращает true, если сессия была сброшена (странице стоит уйти на «/»). */
export async function reconcileSession(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false
  if (!getSession()) return false
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    await signOut()
    return true
  }
  return false
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
  // запоминаем стабильный id этой сессии для computeMe
  const { data: after } = await sb.auth.getSession()
  setMyUid(after.session?.user?.id ?? null)
}

// =====================================================================
// ВХОД ПО КОДУ
// =====================================================================
/** Нормализуем код входа устойчиво к мобильным клавиатурам: приводим к верхнему
 *  регистру, разные виды тире/дефиса → обычный «-», и выкидываем всё, что не входит
 *  в формат кода (пробелы, невидимые символы, «умные» кавычки от автозамены iOS).
 *  Коды у нас только из [A-Z0-9-], поэтому такая жёсткая чистка безопасна. */
export function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[‐-―−⁃﹣－]/g, '-') // en/em-dash, minus и т.п. → '-'
    .replace(/[^A-Z0-9-]/g, '')
}

export async function signInByCode(code: string): Promise<Session | null> {
  const norm = normalizeCode(code)

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
  if (error) {
    // Разделяем троттлинг и неверный код, чтобы Login показал внятный текст,
    // а не «код не найден» человеку с правильным кодом, который просто заблокировали.
    const msg = String(error.message ?? '')
    if (msg.includes('too_many_attempts')) throw new TooManyAttemptsError()
    if (msg.includes('invalid_code')) return null
    throw error // прочее (сеть/not_authenticated) — наверх, к обработчику страницы
  }
  if (!data) return null

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
  const { data, error } = await sb.from('teams').select('id, code, name, site, mentor, hue, coins').eq('id', ses.teamId).maybeSingle()
  throwOn(error)
  return (data as TeamInfo) ?? null
}

export async function getRoster(teamId: string): Promise<string[]> {
  if (!isSupabaseConfigured) {
    return mockRoster[teamId] ?? (mockRoster[teamId] = [...ROSTER_SEED])
  }
  const sb = requireClient()
  const { data, error } = await sb.from('roster').select('full_name').eq('team_id', teamId)
    .order('is_captain', { ascending: false }).order('ord')
  throwOn(error)
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
      me: computeMe(m.author as string, role, (m.user_id as string) ?? null),
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
        const m = payload.new as { id: string; author: string; text: string; created_at: string; channel: ChatChannel; sender_role?: Role; user_id?: string }
        if (m.channel !== channel) return
        const role = m.sender_role ?? 'player'
        onMsg({ id: m.id, author: m.author, text: m.text, time: hhmm(m.created_at), role, me: computeMe(m.author, role, m.user_id ?? null) })
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
  const { data, error } = await sb.from('cases').select('id, title, difficulty, body').eq('game_id', gameId).order('ord')
  throwOn(error)
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

/** Единый маппинг строки таблицы scores → объект приложения (был продублирован
 *  в getScores и getScoresForGame — расходились дефолты feedback). */
function mapScoreRow(r: Record<string, unknown>): GradeRow {
  return {
    cases: r.cases as number,
    bonus: r.bonus as number,
    superBonus: r.super_bonus as number,
    fcr: r.fcr as number,
    vok: (r.vok as number) ?? 0,
    superBonusVok: (r.super_bonus_vok as number) ?? 0,
    feedback: (r.feedback as string) ?? '',
  }
}

export async function getScores(teamId: string): Promise<Record<string, TeamScore>> {
  if (!isSupabaseConfigured) {
    return TEAMS.find((t) => t.id === teamId)?.perGame ?? {}
  }
  const sb = requireClient()
  const { data, error } = await sb.from('scores').select('*').eq('team_id', teamId)
  throwOn(error)
  const out: Record<string, TeamScore> = {}
  for (const r of data ?? []) {
    out[r.game_id as string] = mapScoreRow(r as Record<string, unknown>)
  }
  return out
}

export async function getSubmission(teamId: string, gameId: string): Promise<{ answer: string; fileName: string | null; filePath: string | null } | null> {
  if (!isSupabaseConfigured) {
    const m = mockSubmissions[`${teamId}:${gameId}`]
    return m ? { answer: m.answer, fileName: m.fileName, filePath: null } : null
  }
  const sb = requireClient()
  const { data, error } = await sb.from('answers').select('text, file_url').eq('team_id', teamId).eq('game_id', gameId).maybeSingle()
  throwOn(error)
  if (!data) return null
  const filePath = (data.file_url as string) ?? null
  return { answer: (data.text as string) ?? '', fileName: filePath ? (filePath.split('/').pop() ?? filePath) : null, filePath }
}

export interface SubmitInput { teamId: string; gameId: string; answer: string; file?: File | null }
/** Возвращает fileUploaded: удалось ли прикрепить файл (false — если файл выбран,
 *  но загрузка не прошла, напр. бакет 'answers' ещё не создан миграцией).
 *  Текст ответа сохраняется ВСЕГДА — загрузка файла не блокирует сдачу ответа. */
export async function submitAnswer(input: SubmitInput): Promise<{ fileUploaded: boolean }> {
  if (!isSupabaseConfigured) {
    const prev = mockSubmissions[`${input.teamId}:${input.gameId}`]
    mockSubmissions[`${input.teamId}:${input.gameId}`] = { answer: input.answer, fileName: input.file?.name ?? prev?.fileName ?? null }
    return { fileUploaded: !!input.file }
  }
  const sb = requireClient()
  // Реально загружаем файл в приватный бакет 'answers' (путь team/game/имя).
  // Раньше сохранялось ТОЛЬКО имя файла — байты никуда не уходили, тренер их не получал.
  // best-effort: если загрузка не прошла — текст ответа всё равно сохраняем, а наверх
  // отдаём fileUploaded=false для честного уведомления (не молчим и не теряем текст).
  let filePath: string | undefined // undefined → не трогаем уже сохранённый файл
  let fileUploaded = false
  if (input.file) {
    const safeName = input.file.name.replace(/[^\wа-яА-ЯёЁ.\- ]+/g, '_')
    const path = `${input.teamId}/${input.gameId}/${safeName}`
    const { error: upErr } = await sb.storage.from('answers').upload(path, input.file, {
      upsert: true,
      contentType: input.file.type || undefined,
    })
    if (!upErr) { filePath = path; fileUploaded = true }
  }
  const row: Record<string, unknown> = { team_id: input.teamId, game_id: input.gameId, text: input.answer }
  if (filePath !== undefined) row.file_url = filePath
  const { error } = await sb.from('answers').upsert(row, { onConflict: 'team_id,game_id' })
  throwOn(error)
  return { fileUploaded: input.file ? fileUploaded : true }
}

/** Ссылка (подписанная, на 10 минут) для скачивания файла ответа из бакета 'answers'. */
export async function getAnswerFileUrl(filePath: string): Promise<string | null> {
  if (!isSupabaseConfigured) return null
  const sb = requireClient()
  const { data, error } = await sb.storage.from('answers').createSignedUrl(filePath, 60 * 10)
  if (error) return null
  return data?.signedUrl ?? null
}

export interface GradeInput { teamId: string; gameId: string; cases: number; bonus: number; superBonus: number; fcr: number; vok: number; superBonusVok: number; feedback: string }

/** Маппинг GradeInput → строка scores (общий для одиночного и пакетного сохранения). */
function gradeRow(i: GradeInput) {
  return {
    team_id: i.teamId, game_id: i.gameId,
    cases: i.cases, bonus: i.bonus, super_bonus: i.superBonus,
    fcr: i.fcr, vok: i.vok, super_bonus_vok: i.superBonusVok,
    feedback: i.feedback,
  }
}

export async function gradeSubmission(input: GradeInput): Promise<void> {
  if (!isSupabaseConfigured) return
  const { error } = await requireClient().from('scores').upsert(gradeRow(input), { onConflict: 'team_id,game_id' })
  throwOn(error)
}

/** Пакетное сохранение баллов всей игры одним запросом (вместо 30 отдельных upsert). */
export async function gradeMany(inputs: GradeInput[]): Promise<void> {
  if (!isSupabaseConfigured || inputs.length === 0) return
  const { error } = await requireClient().from('scores').upsert(inputs.map(gradeRow), { onConflict: 'team_id,game_id' })
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
  const { data, error } = await sb.rpc('get_rating')
  throwOn(error)
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
  const { data, error } = await sb.from('teams').select('id, code, name, site, hue').order('name')
  throwOn(error)
  return (data as AdminTeamRow[]) ?? []
}

export async function getScoresForGame(gameId: string): Promise<Record<string, GradeRow>> {
  if (!isSupabaseConfigured) {
    const out: Record<string, GradeRow> = {}
    for (const t of TEAMS) {
      const s = t.perGame[gameId]
      if (s) out[t.id] = { cases: s.cases, bonus: s.bonus, superBonus: s.superBonus, fcr: s.fcr, vok: s.vok ?? 0, superBonusVok: s.superBonusVok ?? 0, feedback: s.feedback ?? '' }
    }
    return out
  }
  const sb = requireClient()
  const { data, error } = await sb.from('scores').select('*').eq('game_id', gameId)
  throwOn(error)
  const out: Record<string, GradeRow> = {}
  for (const r of data ?? []) {
    out[r.team_id as string] = mapScoreRow(r as Record<string, unknown>)
  }
  return out
}

/** Ответы всех команд по игре (для админки): текст + путь к файлу. Ключ — team_id.
 *  Даёт и «кто сдал» (наличие строки в answers), и содержимое для проверки. */
export async function getAnswersForGame(gameId: string): Promise<Record<string, { answer: string; filePath: string | null }>> {
  if (!isSupabaseConfigured) return {}
  const sb = requireClient()
  const { data, error } = await sb.from('answers').select('team_id, text, file_url').eq('game_id', gameId)
  throwOn(error)
  const out: Record<string, { answer: string; filePath: string | null }> = {}
  for (const r of data ?? []) {
    out[r.team_id as string] = { answer: (r.text as string) ?? '', filePath: (r.file_url as string) ?? null }
  }
  return out
}

// =====================================================================
// ИГРЫ СЕЗОНА + ЛЕНТА ДОСКИ + ПУБЛИКАЦИЯ (админ)
// =====================================================================
export async function getGames(): Promise<Game[]> {
  if (!isSupabaseConfigured) return GAMES
  const sb = requireClient()
  const { data, error } = await sb.from('games').select('id, num, week, title, skill, emoji, accent, status, video_url, file_url').order('num')
  throwOn(error)
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

// =====================================================================
// ОБРАТНАЯ СВЯЗЬ ТЕСТИРОВЩИКОВ (форма «Оставить отзыв»)
// =====================================================================
export type FeedbackCategory = 'bug' | 'question' | 'idea'
export interface FeedbackInput {
  category: FeedbackCategory
  did: string
  expected?: string
  got?: string
  device?: string
}
export interface FeedbackRow {
  id: string; teamName: string; author: string; category: FeedbackCategory
  did: string; expected: string; got: string; device: string
  status: 'new' | 'seen' | 'fixed'; createdAt: string
}

/** Отправить отзыв/баг. Работает только на живой базе — в демо-режиме молча игнорируем. */
export async function submitFeedback(input: FeedbackInput): Promise<void> {
  if (!isSupabaseConfigured) return
  const ses = getSession()
  const author = ses?.role === 'admin' ? 'Админ' : (getDisplayName() ?? ses?.name ?? 'Тестировщик')
  const { error } = await requireClient().from('bug_reports').insert({
    team_id: ses?.teamId ?? null,
    author,
    category: input.category,
    did: input.did,
    expected: input.expected ?? null,
    got: input.got ?? null,
    device: input.device ?? null,
  })
  throwOn(error)
}

/** Список отзывов для админки, с именем команды (join). */
export async function listFeedback(): Promise<FeedbackRow[]> {
  if (!isSupabaseConfigured) return []
  const sb = requireClient()
  const { data, error } = await sb
    .from('bug_reports')
    .select('id, author, category, did, expected, got, device, status, created_at, teams(name)')
    .order('created_at', { ascending: false })
    .limit(200)
  throwOn(error)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    teamName: ((r.teams as { name?: string } | null)?.name) ?? '—',
    author: r.author as string,
    category: r.category as FeedbackCategory,
    did: r.did as string,
    expected: (r.expected as string) ?? '',
    got: (r.got as string) ?? '',
    device: (r.device as string) ?? '',
    status: r.status as FeedbackRow['status'],
    createdAt: new Date(r.created_at as string).toLocaleString('ru', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
  }))
}

export async function setFeedbackStatus(id: string, status: FeedbackRow['status']): Promise<void> {
  if (!isSupabaseConfigured) return
  const { error } = await requireClient().from('bug_reports').update({ status }).eq('id', id)
  throwOn(error)
}
