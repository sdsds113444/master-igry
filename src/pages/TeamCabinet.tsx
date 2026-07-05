import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Play, FileDown, Upload, Send, MessageCircle, Crown, CheckCircle2, Clock, Star,
  UserPlus, X, MessageSquare, Loader2, Pencil, Coins, ChevronDown,
} from 'lucide-react'
import {
  GAME_VIDEO, GAME_FILE,
  type TeamScore, type CaseItem, type Game,
} from '../data/mock'
import {
  getMyTeam, listTeamsRating, getRoster, addPlayer as dbAddPlayer, removePlayer as dbRemovePlayer,
  getCases, getScores, getSubmission, submitAnswer, getGames, pickCurrentGame,
  type TeamInfo, type RosterMember,
} from '../lib/db'
import { rankTier, rankPercent, DEADLINE, diffBadge, teamAvatar, basename } from '../lib/ui'
import { teamTotal } from '../lib/scoring'
import VideoModal from '../components/VideoModal'
import MentorChatModal from '../components/MentorChatModal'
import ChatThread from '../components/ChatThread'
import Badge from '../components/Badge'
import ErrorCard from '../components/ErrorCard'

export default function TeamCabinet() {
  const [me, setMe] = useState<TeamInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [rank, setRank] = useState(1)
  const [total, setTotal] = useState(0)

  const [videoOpen, setVideoOpen] = useState(false)
  const [mentorChatOpen, setMentorChatOpen] = useState(false)

  const [games, setGames] = useState<Game[]>([])
  const [current, setCurrent] = useState<Game | null>(null)
  const [cases, setCases] = useState<CaseItem[]>([])
  const [openCases, setOpenCases] = useState<Set<string>>(new Set()) // раскрытые кейсы (аккордеон)
  const [scores, setScores] = useState<Record<string, TeamScore>>({})

  const [answer, setAnswer] = useState('')
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [fileAttached, setFileAttached] = useState<string | null>(null) // имя для показа
  const [file, setFile] = useState<File | null>(null)                   // новый выбранный файл (грузим в Storage)

  const [roster, setRoster] = useState<RosterMember[]>([])
  const [newPlayer, setNewPlayer] = useState('')
  const [rosterError, setRosterError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // getMyTeam и getGames независимы — грузим параллельно (был водопад из трёх
        // последовательных сетевых раундов).
        const [team, gs] = await Promise.all([getMyTeam(), getGames()])
        if (cancelled) return
        setMe(team)
        if (!team) { setLoading(false); return }

        const cur = pickCurrentGame(gs)
        if (!cur) { setGames(gs); setCurrent(null); setLoading(false); return }

        const [rating, r, c, s, sub] = await Promise.all([
          listTeamsRating(),
          getRoster(team.id),
          getCases(cur.id),
          getScores(team.id),
          getSubmission(team.id, cur.id),
        ])
        if (cancelled) return

        const mine = rating.find((x) => x.id === team.id)
        setRank(mine?.rank ?? 1)
        setTotal(mine?.total ?? 0)
        setGames(gs)
        setCurrent(cur)
        setRoster(r)
        setCases(c)
        setScores(s)
        if (sub) { setAnswer(sub.answer); setFileAttached(sub.fileName); setSent(true) }
        // sub.filePath — путь к ранее загруженному файлу; новый файл (file) заменит его

      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()

    return () => { cancelled = true }
  }, [])

  const tier = rankTier(rank)
  const rankProgress = rankPercent(rank)

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    const name = newPlayer.trim()
    if (!name || !me) return
    setRosterError('')
    // Оптимистично показываем с временным id, затем заменяем на строку из БД
    // (с настоящим id) — откат тоже по id, а не по имени, чтобы не задеть тёзку.
    const tempId = `tmp-${Date.now()}`
    setRoster((r) => [...r, { id: tempId, name, isCaptain: false }])
    setNewPlayer('')
    try {
      const created = await dbAddPlayer(me.id, name)
      setRoster((r) => r.map((p) => (p.id === tempId ? created : p)))
    } catch {
      setRoster((r) => r.filter((p) => p.id !== tempId)) // откат оптимистичного добавления
      setRosterError('Не удалось добавить игрока — попробуйте ещё раз.')
    }
  }

  async function removePlayer(member: RosterMember) {
    if (!me) return
    const prev = roster
    setRosterError('')
    setRoster((r) => r.filter((p) => p.id !== member.id))
    try {
      await dbRemovePlayer(me.id, member.id)
    } catch {
      setRoster(prev) // откат: возвращаем игрока в список
      setRosterError('Не удалось убрать игрока — попробуйте ещё раз.')
    }
  }

  // Есть что сдавать: непустой текст, новый файл или ранее прикреплённый файл.
  // Иначе пустой upsert создал бы строку в answers, и админка сочла бы её «сдано».
  const canSubmit = !!answer.trim() || !!file || !!fileAttached

  async function sendAnswer() {
    if (!me || !current || sending || !canSubmit) return // guard от двойной/пустой отправки
    setSendError('')
    setSending(true)
    try {
      // Реально загружаем файл (если выбран) в Storage и сохраняем ответ.
      const res = await submitAnswer({ teamId: me.id, gameId: current.id, answer, file })
      const hadFile = !!file
      setFile(null)
      setSent(true) // помечаем «сдано» СРАЗУ после успешного upsert — не привязываем к
                    // подтверждающему чтению ниже (оно может моргнуть сетью и дать
                    // ложную ошибку «не отправился», хотя ответ уже в БД).
      if (hadFile && !res.fileUploaded) {
        setSendError('Текст ответа сохранён, но файл пока не удалось прикрепить. Попробуйте прикрепить его чуть позже.')
      }
      // Подтверждаем, что реально сохранилось (отдельно: сбой чтения не критичен).
      try {
        const fresh = await getSubmission(me.id, current.id)
        if (fresh) { setAnswer(fresh.answer); setFileAttached(fresh.fileName) }
      } catch { /* upsert уже прошёл — данные не потеряны */ }
    } catch {
      setSendError('Ответ не отправился. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">Загружаем кабинет команды…</span>
        <div className="skeleton h-28 rounded-glass border border-white/60" />
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <div className="skeleton h-52 rounded-glass border border-white/60" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-3xl border border-white/60" />
            ))}
            <div className="skeleton h-48 rounded-glass border border-white/60" />
          </div>
          <div className="space-y-4">
            <div className="skeleton h-28 rounded-glass border border-white/60" />
            <div className="skeleton h-56 rounded-glass border border-white/60" />
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return <ErrorCard title="Не удалось загрузить кабинет" />
  }

  if (!me) {
    return (
      <div className="glass rounded-glass p-8 text-center">
        <p className="font-display text-lg font-bold">Эта страница только для команд</p>
        <p className="mt-1 text-sm text-ink-soft">Вы вошли как администратор — у вас нет своего кабинета команды.</p>
      </div>
    )
  }

  if (!current) {
    return <ErrorCard title="Активная игра ещё не назначена" hint="Задание недели скоро появится — загляните чуть позже." />
  }

  const videoTitle = `Мультик КОЯ — ${current.title}`
  // Ассеты из БД (video_url/file_url), с откатом на статичные карты и защитой от undefined.
  const videoSrc = current.video_url || GAME_VIDEO[current.id] || ''
  const casesHref = current.file_url || GAME_FILE[current.id] || ''
  const fileName = casesHref ? basename(casesHref, 'кейсы.xlsx') : 'кейсы.xlsx'

  return (
    <div className="space-y-6">
      <VideoModal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title={videoTitle}
        src={videoSrc}
      />
      {/* Шапка команды */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong flex flex-wrap items-center gap-4 rounded-glass p-5"
      >
        <span
          className="grid h-16 w-16 place-items-center rounded-3xl text-2xl font-extrabold shadow-lg"
          style={{ background: teamAvatar(me.hue).bg, color: teamAvatar(me.hue).fg }}
        >
          {me.name.slice(0, 1)}
        </span>
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold">{me.name}</h1>
            <span className="rounded-full sf-2 px-2.5 py-1 text-xs font-bold text-ink-soft">{me.code}</span>
          </div>
          <div className="mt-0.5 text-sm text-ink-soft">
            {me.site} · тренер: <b>{me.mentor}</b>
          </div>
        </div>
        <div className="flex gap-3">
          <Stat label="Место" value={`#${rank}`} />
          <Stat label="Очки" value={total} />
          <Stat
            label={<span className="inline-flex items-center gap-1"><Coins size={11} style={{ color: 'var(--color-gold)' }} /> Койны</span>}
            value={me.coins}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://xlink.achat.best/join/chat/NGM0ODFlNWYtNDU3NS01ZGVlLThiYTctMTgxYTM0YzE5NDE3OjI1MjE3Yzk1LTY3YTYtNTcxYS1hMzM0LWViMDFiZDExY2M2ODo1ODZkMmYxYy04MjA2LTVmM2MtODA4ZC1hOTU2YWFhMjk5ZTg6OWMzMmUzMTctZWUxNi01ZDI1LTlmZGYtODkzNTUxMGM3NmEy"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl sf-2 px-4 py-2.5 text-sm font-bold text-ink transition-colors sf-hover"
          >
            <MessageCircle size={16} /> Общий чат
          </a>
          <button
            onClick={() => setMentorChatOpen(true)}
            className="btn-alfa flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold"
          >
            <Send size={16} /> Написать тренеру
          </button>
        </div>
      </motion.div>

      <MentorChatModal
        open={mentorChatOpen}
        onClose={() => setMentorChatOpen(false)}
        teamId={me.id}
        teamName={me.name}
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* ==== ЛЕВАЯ КОЛОНКА ==== */}
        <section className="space-y-4">
          <div className="glass rounded-glass p-5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-alfa-ink">
              <Clock size={13} /> Дедлайн: {DEADLINE}
            </div>
            <h2 className="mt-1 font-display text-2xl font-extrabold">{current.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{current.skill}</p>

            {/* Мультик + файл */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setVideoOpen(true)}
                disabled={!videoSrc}
                className="group relative flex min-h-[112px] items-end overflow-hidden rounded-2xl bg-gradient-to-br from-alfa-soft to-alfa p-4 text-left text-white disabled:opacity-60"
              >
                <span className="pointer-events-none absolute -right-4 -top-6 text-7xl opacity-25 transition-transform group-hover:scale-110">🎬</span>
                <div className="relative">
                  <span className="mb-1.5 inline-grid h-9 w-9 place-items-center rounded-full bg-white/25">
                    <Play size={16} />
                  </span>
                  <div className="text-sm font-bold">{videoTitle}</div>
                  <div className="text-xs text-white/80">Посмотреть перед стартом</div>
                </div>
              </button>
              {casesHref ? (
                <a
                  href={casesHref}
                  download={fileName}
                  className="group flex min-h-[112px] flex-col justify-end rounded-2xl sf-2 p-4 text-left transition-colors sf-hover"
                >
                  <span className="mb-1.5 inline-grid h-9 w-9 place-items-center rounded-full bg-alfa/10 text-alfa">
                    <FileDown size={16} />
                  </span>
                  <div className="text-sm font-bold">Скачать кейсы</div>
                  <div className="truncate text-xs text-ink-soft">
                    Все {cases.length} кейсов · Excel
                  </div>
                </a>
              ) : (
                <div className="flex min-h-[112px] flex-col justify-end rounded-2xl sf-2 p-4 text-left opacity-60">
                  <span className="mb-1.5 inline-grid h-9 w-9 place-items-center rounded-full bg-alfa/10 text-alfa">
                    <FileDown size={16} />
                  </span>
                  <div className="text-sm font-bold">Файл кейсов готовится</div>
                  <div className="truncate text-xs text-ink-soft">Скоро появится</div>
                </div>
              )}
            </div>
          </div>

          {/* Кейсы — раскрывающийся список (по умолчанию свёрнуты, чтобы не листать всё) */}
          <div className="space-y-3">
            {cases.map((c, i) => {
              const open = openCases.has(c.id)
              return (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="glass lift overflow-hidden rounded-3xl"
                >
                  <button
                    type="button"
                    onClick={() => setOpenCases((s) => {
                      const n = new Set(s)
                      if (n.has(c.id)) n.delete(c.id); else n.add(c.id)
                      return n
                    })}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-2 p-4 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl sf-2 text-sm font-extrabold">{i + 1}</span>
                      <h3 className="truncate text-base font-bold">{c.title}</h3>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge style={{ background: diffBadge(c.difficulty).bg, color: diffBadge(c.difficulty).fg }}>
                        {c.difficulty}
                      </Badge>
                      <ChevronDown size={18} className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {open && <p className="px-4 pb-4 text-sm text-ink-soft">{c.text}</p>}
                </motion.div>
              )
            })}
          </div>

          {/* Сдать ответ */}
          <div className="glass-strong rounded-glass p-5">
            <h3 className="font-display text-lg font-bold">Ответ команды</h3>
            <p className="text-sm text-ink-soft">Обсудите в чате и оформите общий ответ. Отправляет капитан.</p>
            {sent ? (
              <>
                <div
                  className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-success/10 p-4 text-success"
                  role="status"
                >
                  <CheckCircle2 className="shrink-0" /> Ответ отправлен тренеру! Ждите обратную связь в пятницу.
                  <button
                    onClick={() => setSent(false)}
                    className="ml-auto flex items-center gap-1.5 rounded-xl sf-2 px-3 py-1.5 text-xs font-bold text-ink transition-colors sf-hover"
                  >
                    <Pencil size={13} /> Изменить ответ
                  </button>
                </div>
                {sendError && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{sendError}</p>}
              </>
            ) : (
              <>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={5}
                  placeholder="Впишите решение по кейсам или прикрепите заполненный файл…"
                  className="field mt-3 w-full resize-none p-4 text-sm outline-none"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex max-w-full cursor-pointer items-center gap-2 rounded-2xl sf-2 px-4 py-2.5 text-sm font-bold transition-colors sf-hover">
                    <Upload size={16} className="shrink-0" />
                    <span className="truncate">
                      {fileAttached ? fileAttached : 'Прикрепить заполненный файл'}
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        // Потолок согласован с запасным каналом /sb (прокси Vercel обрывает
                        // запросы длиннее 120 с — большой файл на слабой сети не успеет).
                        if (f && f.size > 15 * 1024 * 1024) {
                          setSendError('Файл больше 15 МБ — сожмите его и прикрепите снова.')
                          e.target.value = ''
                          return
                        }
                        setSendError('')
                        setFile(f)
                        if (f) setFileAttached(f.name)
                      }}
                    />
                  </label>
                  <button
                    onClick={sendAnswer}
                    disabled={sending || !canSubmit}
                    title={!canSubmit ? 'Впишите ответ или прикрепите файл' : undefined}
                    className="btn-alfa ml-auto flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
                  >
                    {sending
                      ? <><Loader2 size={16} className="animate-spin" /> Отправляю…</>
                      : <><Send size={16} /> Отправить тренеру</>}
                  </button>
                </div>
                {sendError && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{sendError}</p>}
              </>
            )}
          </div>

          {/* Чат команды */}
          <div className="glass rounded-glass p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
              <MessageSquare size={18} /> Чат команды
            </h3>
            <ChatThread teamId={me.id} channel="team" msgPlaceholder="Написать команде…" />
            <p className="mt-2 text-xs text-ink-soft">
              Имя видно только вашей команде — это подпись сообщений, не логин.
            </p>
          </div>
        </section>

        {/* ==== ПРАВАЯ КОЛОНКА ==== */}
        <aside className="space-y-4">
          {/* Место в сезоне с маскотом КОЯ */}
          <div className="glass-strong relative overflow-hidden rounded-glass">
            <div className="flex items-stretch">
              <div className="relative w-32 shrink-0 sm:w-36">
                <img
                  src="/koya/koya-peek-crop.webp"
                  alt="КОЯ"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectPosition: '72% center',
                    WebkitMaskImage: 'linear-gradient(to right, #000 58%, transparent)',
                    maskImage: 'linear-gradient(to right, #000 58%, transparent)',
                  }}
                />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center py-5 px-4 text-center">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Место в сезоне
                </div>
                <div className="font-display text-3xl font-extrabold leading-none">
                  #{rank}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-sm font-bold" style={{ color: tier.color }}>
                  <span>{tier.emoji}</span> {tier.label}
                </div>
                <div className="mt-2 h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                  <div className="h-full rounded-full transition-[width]" style={{ width: `${rankProgress}%`, background: tier.color }} />
                </div>
                <div className="mt-1 text-xs font-semibold text-ink-soft">
                  из 30 команд
                </div>
              </div>
            </div>
          </div>

          {/* Состав */}
          <div className="glass rounded-glass p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Состав команды</h3>
              <span className="rounded-full sf-2 px-2.5 py-1 text-xs font-bold text-ink-soft">
                {roster.length} чел
              </span>
            </div>
            <ul className="space-y-1.5">
              {roster.map((p) => (
                <li key={p.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-1 sf-hoversoft">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full sf-2 text-xs font-bold">{p.name.slice(0, 1)}</span>
                  <span className="flex-1 text-sm font-semibold">{p.name}</span>
                  {p.isCaptain ? (
                    <span className="grid h-9 w-9 place-items-center" title="Капитан">
                      <Crown size={16} style={{ color: 'var(--color-gold)' }} />
                    </span>
                  ) : (
                    <button
                      onClick={() => removePlayer(p)}
                      aria-label={`Убрать игрока ${p.name}`}
                      title="Убрать игрока"
                      className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa focus-visible:bg-alfa/10 focus-visible:text-alfa"
                    >
                      <X size={16} />
                    </button>
                  )}
                </li>
              ))}
              {roster.length === 0 && (
                <li className="rounded-xl px-2 py-3 text-center text-xs text-ink-soft">
                  Пока никого нет — добавьте игроков ниже.
                </li>
              )}
            </ul>
            <form onSubmit={addPlayer} className="mt-3 flex gap-2">
              <input
                value={newPlayer}
                onChange={(e) => setNewPlayer(e.target.value)}
                placeholder="Имя игрока…"
                className="field flex-1 px-3 py-2 text-sm outline-none"
              />
              <button type="submit" className="btn-alfa flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold">
                <UserPlus size={15} /> Добавить
              </button>
            </form>
            {rosterError && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{rosterError}</p>}
            <p className="mt-2 text-xs text-ink-soft">Капитан регистрирует состав команды.</p>
          </div>

          {/* Баллы + обратная связь тренера */}
          <div className="glass rounded-glass p-5">
            <h3 className="mb-3 font-display text-lg font-bold">Баллы и обратная связь</h3>
            <div className="space-y-2.5">
              {games.filter((g) => g.status !== 'locked' && scores[g.id]).length === 0 && (
                <div className="rounded-2xl sf-1 p-4 text-center text-xs text-ink-soft">
                  Оценки и обратная связь появятся здесь после проверки ответов тренером.
                </div>
              )}
              {games.filter((g) => g.status !== 'locked').map((g) => {
                const s = scores[g.id]
                if (!s) return null
                const superVok = s.superBonusVok ?? 0
                const sum = teamTotal({ cases: s.cases, bonus: s.bonus, superBonus: s.superBonus, superBonusVok: superVok })
                return (
                  <div key={g.id} className="rounded-2xl sf-1 p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{g.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{g.title}</div>
                        <div className="text-xs font-semibold text-ink-soft">
                          кейсы {s.cases}
                          {s.bonus > 0 && ` · бонус +${s.bonus}`}
                          {s.superBonus > 0 && ` · супер FCR +${s.superBonus}`}
                          {superVok > 0 && ` · супер ВОК +${superVok}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-base font-bold">
                        {sum > 0 ? sum : '—'}
                        {(s.superBonus > 0 || superVok > 0) && <Star size={13} style={{ color: 'var(--color-gold)' }} fill="currentColor" />}
                      </div>
                    </div>
                    {s.feedback && (
                      <div className="mt-2 flex gap-2 rounded-xl sf-2 p-2.5">
                        <MessageCircle size={14} className="mt-0.5 shrink-0 text-alfa" />
                        <div className="text-xs text-ink-soft">
                          <b className="text-ink">ОС тренера:</b> {s.feedback}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: React.ReactNode; value: string | number }) {
  return (
    <div className="rounded-2xl sf-1 px-4 py-2 text-center">
      <div className="font-display text-xl font-bold">{value}</div>
      <div className="text-xs font-semibold text-ink-soft">{label}</div>
    </div>
  )
}
