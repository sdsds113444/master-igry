import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Play, FileDown, Upload, Send, MessageCircle, Crown, CheckCircle2, Clock, Star,
  UserPlus, X, MessageSquare, Loader2,
} from 'lucide-react'
import {
  CURRENT_TASK, GAMES, GAME_VIDEO, GAME_FILE, MENTOR_CONTACT,
  type TeamScore, type CaseItem,
} from '../data/mock'
import {
  getMyTeam, listTeamsRating, getRoster, addPlayer as dbAddPlayer, removePlayer as dbRemovePlayer,
  getCases, getScores, getSubmission, submitAnswer,
  listMessages, sendMessage, subscribeMessages, getDisplayName, setDisplayName,
  type TeamInfo, type ChatMsg,
} from '../lib/db'
import Stars from '../components/Stars'
import VideoModal from '../components/VideoModal'

const diffColor: Record<string, string> = {
  Лёгкий: '#1ea672',
  Средний: '#e8b21e',
  Сложный: '#ef3124',
}

export default function TeamCabinet() {
  const [me, setMe] = useState<TeamInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [rank, setRank] = useState(1)
  const [total, setTotal] = useState(0)

  const [videoOpen, setVideoOpen] = useState(false)

  const [cases, setCases] = useState<CaseItem[]>([])
  const [scores, setScores] = useState<Record<string, TeamScore>>({})

  const [answer, setAnswer] = useState('')
  const [sent, setSent] = useState(false)
  const [fileAttached, setFileAttached] = useState<string | null>(null)

  const [roster, setRoster] = useState<string[]>([])
  const [newPlayer, setNewPlayer] = useState('')

  const [chat, setChat] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [myName, setMyName] = useState(getDisplayName() ?? '')
  const nameConfirmed = !!getDisplayName()

  useEffect(() => {
    let unsub: { unsubscribe(): void } | null = null
    let cancelled = false

    async function load() {
      const team = await getMyTeam()
      if (cancelled) return
      setMe(team)
      if (!team) { setLoading(false); return }

      const [rating, r, c, s, sub, msgs] = await Promise.all([
        listTeamsRating(),
        getRoster(team.id),
        getCases(CURRENT_TASK.gameId),
        getScores(team.id),
        getSubmission(team.id, CURRENT_TASK.gameId),
        listMessages(team.id),
      ])
      if (cancelled) return

      const mine = rating.find((x) => x.id === team.id)
      setRank(mine?.rank ?? 1)
      setTotal(mine?.total ?? 0)
      setRoster(r)
      setCases(c)
      setScores(s)
      if (sub) { setAnswer(sub.answer); setFileAttached(sub.fileName); setSent(true) }
      setChat(msgs)
      setLoading(false)

      // Компонент мог размонтироваться, пока грузились данные (напр. двойной
      // запуск эффекта в StrictMode) — тогда сразу отключаем подписку, а не
      // оставляем висеть «осиротевший» канал.
      const liveSub = subscribeMessages(team.id, (m) => setChat((c) => [...c, m]))
      if (cancelled) { liveSub.unsubscribe(); return }
      unsub = liveSub
    }
    load()

    return () => { cancelled = true; unsub?.unsubscribe() }
  }, [])

  const heroStars = 3 + (Math.max(0, 30 - rank) / 30) * 2

  function saveName(e: React.FormEvent) {
    e.preventDefault()
    const n = myName.trim()
    if (!n) return
    setDisplayName(n)
    setMyName(n)
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    const name = newPlayer.trim()
    if (!name || !me) return
    setRoster((r) => [...r, name])
    setNewPlayer('')
    await dbAddPlayer(me.id, name)
  }

  async function removePlayer(name: string) {
    if (!me) return
    setRoster((r) => r.filter((p) => p !== name))
    await dbRemovePlayer(me.id, name)
  }

  async function sendMsg(e: React.FormEvent) {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || !me) return
    setChatInput('')
    await sendMessage(me.id, getDisplayName() ?? me.name, text)
  }

  async function sendAnswer() {
    if (!me) return
    setSent(true)
    await submitAnswer({ teamId: me.id, gameId: CURRENT_TASK.gameId, answer, fileName: fileAttached })
  }

  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-ink-soft">
        <Loader2 className="animate-spin" />
      </div>
    )
  }

  if (!me) {
    return (
      <div className="glass rounded-[28px] p-8 text-center">
        <p className="font-display text-lg font-extrabold">Эта страница только для команд</p>
        <p className="mt-1 text-sm text-ink-soft">Вы вошли как администратор — у вас нет своего кабинета команды.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <VideoModal
        open={videoOpen}
        onClose={() => setVideoOpen(false)}
        title={CURRENT_TASK.videoTitle}
        src={GAME_VIDEO[CURRENT_TASK.gameId]}
      />
      {/* Шапка команды */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong flex flex-wrap items-center gap-4 rounded-[28px] p-5"
      >
        <span
          className="grid h-16 w-16 place-items-center rounded-3xl text-2xl font-extrabold text-white shadow-lg"
          style={{ background: `hsl(${me.hue} 70% 55%)` }}
        >
          {me.name.slice(0, 1)}
        </span>
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold">{me.name}</h1>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-ink-soft">{me.code}</span>
          </div>
          <div className="mt-0.5 text-sm text-ink-soft">
            {me.site} · тренер: <b>{me.mentor}</b>
          </div>
        </div>
        <div className="flex gap-3">
          <Stat label="Место" value={`#${rank}`} />
          <Stat label="Очки" value={total} />
          <Stat label="🪙 Койны" value={me.coins} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://max.ru"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-white"
          >
            <MessageCircle size={16} /> Чат в МАКС
          </a>
          <a
            href={MENTOR_CONTACT}
            className="btn-alfa flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold"
          >
            <Send size={16} /> Написать тренеру
          </a>
        </div>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* ==== ЛЕВАЯ КОЛОНКА ==== */}
        <section className="space-y-4">
          <div className="glass rounded-[28px] p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-alfa">
              <Clock size={13} /> Дедлайн: {CURRENT_TASK.deadline}
            </div>
            <h2 className="mt-1 font-display text-2xl font-extrabold">{CURRENT_TASK.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{CURRENT_TASK.skill}</p>

            {/* Мультик + файл */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={() => setVideoOpen(true)}
                className="group relative flex min-h-[112px] items-end overflow-hidden rounded-2xl bg-gradient-to-br from-alfa-soft to-alfa p-4 text-left text-white"
              >
                <span className="pointer-events-none absolute -right-4 -top-6 text-7xl opacity-25 transition-transform group-hover:scale-110">🎬</span>
                <div className="relative">
                  <span className="mb-1.5 inline-grid h-9 w-9 place-items-center rounded-full bg-white/25">
                    <Play size={16} />
                  </span>
                  <div className="text-sm font-bold">{CURRENT_TASK.videoTitle}</div>
                  <div className="text-xs text-white/80">Посмотреть перед стартом</div>
                </div>
              </button>
              <a
                href={GAME_FILE[CURRENT_TASK.gameId]}
                download={CURRENT_TASK.fileName}
                className="group flex min-h-[112px] flex-col justify-end rounded-2xl bg-white/70 p-4 text-left transition-colors hover:bg-white"
              >
                <span className="mb-1.5 inline-grid h-9 w-9 place-items-center rounded-full bg-alfa/10 text-alfa">
                  <FileDown size={16} />
                </span>
                <div className="text-sm font-bold">Скачать кейсы</div>
                <div className="truncate text-xs text-ink-soft">
                  Все {CURRENT_TASK.totalCases} кейсов · Excel
                </div>
              </a>
            </div>
          </div>

          {/* Кейсы */}
          <div className="space-y-3">
            {cases.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass lift rounded-3xl p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white/70 text-sm font-extrabold">{i + 1}</span>
                    <h3 className="font-display text-[15px] font-extrabold">{c.title}</h3>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                    style={{ background: diffColor[c.difficulty] }}
                  >
                    {c.difficulty}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-soft">{c.text}</p>
              </motion.div>
            ))}
          </div>

          {/* Сдать ответ */}
          <div className="glass-strong rounded-[28px] p-5">
            <h3 className="font-display text-lg font-extrabold">Ответ команды</h3>
            <p className="text-sm text-ink-soft">Обсудите в чате и оформите общий ответ. Отправляет капитан.</p>
            {sent ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-emerald-500/10 p-4 text-emerald-700">
                <CheckCircle2 /> Ответ отправлен тренеру! Ждите обратную связь в пятницу.
              </div>
            ) : (
              <>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={5}
                  placeholder="Впишите решение по кейсам или прикрепите заполненный файл…"
                  className="mt-3 w-full resize-none rounded-2xl border border-black/5 bg-white/70 p-4 text-sm outline-none focus:border-alfa/40"
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex max-w-full cursor-pointer items-center gap-2 rounded-2xl bg-white/70 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-white">
                    <Upload size={16} className="shrink-0" />
                    <span className="truncate">
                      {fileAttached ? fileAttached : 'Прикрепить заполненный файл'}
                    </span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => setFileAttached(e.target.files?.[0]?.name ?? null)}
                    />
                  </label>
                  <button
                    onClick={sendAnswer}
                    className="btn-alfa ml-auto flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold"
                  >
                    <Send size={16} /> Отправить тренеру
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Чат команды */}
          <div className="glass rounded-[28px] p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold">
              <MessageSquare size={18} /> Чат команды
            </h3>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {chat.map((m) => (
                <div key={m.id} className={`flex ${m.me ? 'justify-end' : ''}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 ${m.me ? 'bg-alfa text-white' : 'bg-white/75'}`}>
                    {!m.me && <div className="text-[11px] font-bold text-ink-soft">{m.author}</div>}
                    <div className="text-sm">{m.text}</div>
                    <div className={`mt-0.5 text-[10px] ${m.me ? 'text-white/70' : 'text-ink-soft/70'}`}>{m.time}</div>
                  </div>
                </div>
              ))}
              {chat.length === 0 && <p className="py-3 text-center text-xs text-ink-soft">Пока пусто — напишите первыми.</p>}
            </div>

            {!nameConfirmed ? (
              <form onSubmit={saveName} className="mt-3 flex gap-2">
                <input
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  placeholder="Как вас называть в чате?"
                  className="flex-1 rounded-2xl border border-black/5 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-alfa/40"
                />
                <button type="submit" className="btn-alfa rounded-2xl px-4 py-2.5 text-sm font-bold">Ок</button>
              </form>
            ) : (
              <form onSubmit={sendMsg} className="mt-3 flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Написать команде…"
                  className="flex-1 rounded-2xl border border-black/5 bg-white/70 px-4 py-2.5 text-sm outline-none focus:border-alfa/40"
                />
                <button type="submit" className="btn-alfa grid h-[42px] w-[42px] shrink-0 place-items-center rounded-2xl">
                  <Send size={16} />
                </button>
              </form>
            )}
            <p className="mt-2 text-[11px] text-ink-soft">
              {nameConfirmed
                ? <>Вы пишете как <b>{getDisplayName()}</b>. Видно только вашей команде.</>
                : 'Имя видно только вашей команде — это не логин, просто подпись сообщений.'}
            </p>
          </div>
        </section>

        {/* ==== ПРАВАЯ КОЛОНКА ==== */}
        <aside className="space-y-4">
          {/* Рейтинг героя с маскотом КОЯ */}
          <div className="glass-strong relative overflow-hidden rounded-[28px]">
            <div className="flex items-stretch">
              <div className="relative w-32 shrink-0 sm:w-36">
                <img
                  src="/koya/koya-peek-crop.jpg"
                  alt="КОЯ"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    objectPosition: '72% center',
                    WebkitMaskImage: 'linear-gradient(to right, #000 58%, transparent)',
                    maskImage: 'linear-gradient(to right, #000 58%, transparent)',
                  }}
                />
              </div>
              <div className="flex flex-col justify-center py-5 pr-5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">
                  Рейтинг героя
                </div>
                <div className="my-1.5">
                  <Stars value={heroStars} size={20} />
                </div>
                <div className="font-display text-3xl font-extrabold leading-none">
                  {heroStars.toFixed(1)}
                </div>
                <div className="mt-1 text-xs font-semibold text-ink-soft">
                  #{rank} место из 30
                </div>
              </div>
            </div>
          </div>

          {/* Состав */}
          <div className="glass rounded-[28px] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold">Состав команды</h3>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-bold text-ink-soft">
                {roster.length} чел
              </span>
            </div>
            <ul className="space-y-1.5">
              {roster.map((p, i) => (
                <li key={p + i} className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/50">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/70 text-xs font-bold">{p.slice(0, 1)}</span>
                  <span className="flex-1 text-sm font-semibold">{p}</span>
                  {i === 0 ? (
                    <Crown size={15} style={{ color: 'var(--color-gold)' }} />
                  ) : (
                    <button
                      onClick={() => removePlayer(p)}
                      title="Убрать игрока"
                      className="grid h-6 w-6 place-items-center rounded-full text-ink-soft opacity-0 transition-opacity hover:bg-alfa/10 hover:text-alfa group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form onSubmit={addPlayer} className="mt-3 flex gap-2">
              <input
                value={newPlayer}
                onChange={(e) => setNewPlayer(e.target.value)}
                placeholder="Имя игрока…"
                className="flex-1 rounded-xl border border-black/5 bg-white/70 px-3 py-2 text-sm outline-none focus:border-alfa/40"
              />
              <button type="submit" className="btn-alfa flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold">
                <UserPlus size={15} /> Добавить
              </button>
            </form>
            <p className="mt-2 text-[11px] text-ink-soft">Капитан регистрирует состав команды.</p>
          </div>

          {/* Баллы + обратная связь тренера */}
          <div className="glass rounded-[28px] p-5">
            <h3 className="mb-3 font-display text-lg font-extrabold">Баллы и обратная связь</h3>
            <div className="space-y-2.5">
              {GAMES.filter((g) => g.status !== 'locked').map((g) => {
                const s = scores[g.id]
                if (!s) return null
                const sum = s.cases + s.bonus + s.superBonus
                return (
                  <div key={g.id} className="rounded-2xl bg-white/50 p-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{g.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{g.title}</div>
                        <div className="text-[11px] font-semibold text-ink-soft">
                          кейсы {s.cases}
                          {s.bonus > 0 && ` · бонус +${s.bonus}`}
                          {s.superBonus > 0 && ` · супер +${s.superBonus}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-display text-base font-extrabold">
                        {sum > 0 ? sum : '—'}
                        {s.superBonus > 0 && <Star size={13} style={{ color: 'var(--color-gold)' }} fill="currentColor" />}
                      </div>
                    </div>
                    {s.feedback && (
                      <div className="mt-2 flex gap-2 rounded-xl bg-white/70 p-2.5">
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white/60 px-4 py-2 text-center">
      <div className="font-display text-xl font-extrabold">{value}</div>
      <div className="text-[11px] font-semibold text-ink-soft">{label}</div>
    </div>
  )
}
