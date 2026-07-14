import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, RefreshCw, Check, Trophy, Loader2, MessageCircle, Bug, HelpCircle, Lightbulb, Eye, CheckCheck, FileText, Download, Users, Crown } from 'lucide-react'
import { type Game } from '../data/mock'
import {
  listAllTeamsAdmin, getScoresForGame, gradeMany, getGames, publishGame, pickCurrentGame,
  getAnswersForGame, getAnswerFileUrl, listMentorLatestFromTeams, getMentorSeen, markMentorSeen,
  getRoster, listFeedback, setFeedbackStatus, type AdminTeamRow, type FeedbackRow, type RosterMember,
} from '../lib/db'

/** Короткий «пинг» через WebAudio (без ассета) — сигнал тренеру о новом сообщении.
 *  Не критичен: браузер может блокировать звук до первого клика — глотаем ошибку. */
function playPing() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.start()
    osc.stop(ctx.currentTime + 0.36)
    osc.onended = () => ctx.close()
  } catch { /* звук не критичен */ }
}
import MentorChatModal from '../components/MentorChatModal'
import Dialog from '../components/Dialog'
import ErrorCard from '../components/ErrorCard'
import { teamAvatar, basename } from '../lib/ui'
import { gradeTotal, scoreWrite } from '../lib/scoring'

/** Целое число из поля ввода: защита от NaN и дробей, зажим в [0, max]. */
function clampNum(raw: string, max: number): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
}

interface Grade {
  submitted: boolean
  cases: number
  bonus: boolean
  vok: number
  superBonusVok: boolean
  feedback: string
}

export default function Admin() {
  const [games, setGames] = useState<Game[]>([])
  const [gameId, setGameId] = useState('')
  const [published, setPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false) // есть несохранённые правки баллов
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [teams, setTeams] = useState<AdminTeamRow[]>([])
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  // id команд с несохранёнными правками именно этой сессии — сохраняем ТОЛЬКО их,
  // чтобы не перезаписывать чужие оценки устаревшим снимком (общая админ-учётка).
  const [dirtyTeams, setDirtyTeams] = useState<Set<string>>(new Set())
  const [chatTeam, setChatTeam] = useState<AdminTeamRow | null>(null)
  // Ответы команд по выбранной игре (текст + путь к файлу) — источник «сдал/не сдал» и просмотра.
  const [answers, setAnswers] = useState<Record<string, { answer: string; filePath: string | null }>>({})
  const [viewTeam, setViewTeam] = useState<AdminTeamRow | null>(null)
  const [rosterTeam, setRosterTeam] = useState<AdminTeamRow | null>(null) // «провалиться» и посмотреть состав
  // «Пипочка»: по каждой команде — время последнего сообщения от неё в чате с тренером.
  const [mentorLatest, setMentorLatest] = useState<Record<string, number>>({})
  const [seenTick, setSeenTick] = useState(0) // форс-пересчёт непрочитанного после «прочитано»
  const prevUnreadCount = useRef<number | null>(null)

  // Список игр (+ игра по умолчанию) и список команд грузим ОДИН раз: команды от
  // выбранной игры не зависят, ни к чему перезапрашивать их при каждом переключении.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [gs, ts] = await Promise.all([getGames(), listAllTeamsAdmin()])
        if (cancelled) return
        setGames(gs)
        setTeams(ts)
        setGameId((cur) => cur || pickCurrentGame(gs)?.id || gs[0]?.id || '')
      } catch {
        if (!cancelled) { setLoadError(true); setLoading(false) }
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Оценки и ответы по выбранной игре. Строится из уже загруженного списка команд.
  useEffect(() => {
    if (!gameId || teams.length === 0) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setSaveError('')
      setLoadError(false) // транзиентный сбой при переключении игры не должен навсегда ронять всю панель
      try {
        const [scores, ans] = await Promise.all([
          getScoresForGame(gameId), getAnswersForGame(gameId),
        ])
        if (cancelled) return
        const init: Record<string, Grade> = {}
        for (const t of teams) {
          const s = scores[t.id]
          // «Сдала» определяется наличием ответа в таблице answers, а не величиной баллов —
          // иначе команда, сдавшая ответ и получившая 0, после перезагрузки выглядела бы «не сдала».
          const submitted = !!ans[t.id]
            || (s ? (s.cases > 0 || s.bonus > 0 || s.superBonusVok > 0 || s.vok > 0 || !!s.feedback) : false)
          init[t.id] = s
            ? { submitted, cases: s.cases, bonus: s.bonus > 0, vok: s.vok, superBonusVok: s.superBonusVok > 0, feedback: s.feedback }
            : { submitted, cases: 0, bonus: false, vok: 0, superBonusVok: false, feedback: '' }
        }
        setGrades(init)
        setAnswers(ans)
        setPublished(false)
        setSaved(false)
        setDirty(false)
        setDirtyTeams(new Set())
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [gameId, teams])

  // Опрос непрочитанных сообщений от команд: раз в 45с (не критична секундная
  // свежесть, важно не грузить бесплатный тариф Supabase лишними запросами при
  // нескольких одновременных тестерах) + при возврате на вкладку. Звук — когда
  // появилось НОВОЕ непрочитанное.
  useEffect(() => {
    let stopped = false
    async function check() {
      if (document.visibilityState !== 'visible') return
      try {
        const latest = await listMentorLatestFromTeams()
        if (stopped) return
        setMentorLatest(latest)
        const count = Object.keys(latest).filter((tid) => latest[tid] > getMentorSeen(tid)).length
        if (prevUnreadCount.current !== null && count > prevUnreadCount.current) playPing()
        prevUnreadCount.current = count
      } catch { /* тихо: фоновый опрос */ }
    }
    check()
    const timer = window.setInterval(check, 45000)
    window.addEventListener('focus', check)
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [])

  // Множество команд с непрочитанными (seenTick форсит пересчёт после «прочитано»).
  const mentorUnread = useMemo(() => {
    const s = new Set<string>()
    for (const tid of Object.keys(mentorLatest)) {
      if (mentorLatest[tid] > getMentorSeen(tid)) s.add(tid)
    }
    return s
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentorLatest, seenTick])

  // Открыть чат с командой: помечаем прочитанным, гасим точку.
  const openTeamChat = useCallback((t: AdminTeamRow) => {
    // Помечаем прочитанным серверным временем последнего сообщения команды (а не Date.now()):
    // read-state сравнивается с server created_at, клиентские часы могут врать.
    markMentorSeen(t.id, mentorLatest[t.id] ?? Date.now())
    setSeenTick((n) => n + 1)
    setChatTeam(t)
  }, [mentorLatest])

  const submittedCount = Object.values(grades).filter((g) => g.submitted).length
  const isPublished = games.find((g) => g.id === gameId)?.status === 'current'

  // Стабильная ссылка (useCallback + функциональные setState без внешних зависимостей):
  // нужна, чтобы мемоизированные строки/карточки команд не ре-рендерились все разом
  // на каждый ввод символа — перерисовывается только та команда, чей grade изменился.
  const upd = useCallback((id: string, patch: Partial<Grade>) => {
    setGrades((g) => ({ ...g, [id]: { ...g[id], ...patch } }))
    setDirtyTeams((s) => { const n = new Set(s); n.add(id); return n }) // помечаем команду изменённой
    setSaved(false)
    setDirty(true)
  }, [])

  // Пока есть несохранённые баллы — предупреждаем при обновлении/закрытии вкладки
  // (главный вектор случайной потери: оценивание — самая трудоёмкая операция).
  // Смену игры внутри страницы уже страхует changeGame() ниже.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Смена игры при несохранённых правках: эффект по gameId безусловно перезатирает
  // grades серверными данными — без подтверждения ввод по 30 командам пропал бы молча.
  function changeGame(nextId: string) {
    if (nextId === gameId) return
    if (dirty && !window.confirm('Есть несохранённые баллы. Переключить игру и потерять их?')) return
    setGameId(nextId)
  }

  async function saveAll() {
    setSaving(true)
    setSaveError('')
    try {
      // КРИТИЧНО: пишем ТОЛЬКО реально изменённые в этой сессии команды, а не весь батч по
      // всем командам. Раньше saveAll слепо апсертил строки ВСЕХ команд из локального
      // снимка → при общей админ-учётке второй тренер затирал баллы первого нулями из
      // своего устаревшего снимка (тихий lost-update). Маппинг «строка оценивания → очки»
      // вынесен в scoreWrite (scoring.ts) и покрыт тестами.
      const changed = teams.filter((t) => dirtyTeams.has(t.id))
      if (changed.length > 0) {
        await gradeMany(changed.map((t) => ({ teamId: t.id, gameId, ...scoreWrite(grades[t.id]) })))
      }
      setSaved(true)
      setDirty(false)
      setDirtyTeams(new Set())
    } catch {
      setSaveError('Не удалось сохранить баллы. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    if (!gameId || publishing) return
    // Публикация необратима: игра открывается всем 30 командам + пишется запись в ленту.
    const g = games.find((x) => x.id === gameId)
    if (!window.confirm(`Выложить «${g?.title ?? 'задание'}» на доску всем командам? Текущее задание недели сменится, отменить нельзя.`)) return
    setPublishing(true)
    setSaveError('')
    try {
      await publishGame(gameId)
      setPublished(true) // помечаем сразу после успешной публикации, не привязываясь к
                         // следующему запросу — иначе его сбой оставлял бы кнопку
                         // активной и повторный клик задваивал бы запись в ленте.
    } catch {
      setSaveError('Не удалось опубликовать задание. Попробуйте ещё раз.')
      setPublishing(false)
      return
    }
    setPublishing(false)
    // Подтягиваем новый статус игры отдельно — сбой обновления не критичен.
    getGames().then(setGames).catch(() => { /* статус подтянется при следующей загрузке */ })
  }

  if (loadError) {
    return <ErrorCard title="Не удалось загрузить админку" />
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="glass-strong flex flex-wrap items-center gap-4 rounded-glass p-5">
        <img
          src="/koya/koya-sit-crop.webp"
          alt="КОЯ"
          className="h-14 w-14 shrink-0 rounded-3xl object-cover shadow-md ring-2 ring-white/70"
          style={{ objectPosition: 'center 12%' }}
        />
        <div className="mr-auto">
          <h1 className="font-display text-2xl font-extrabold">Панель организатора</h1>
          <p className="text-sm text-ink-soft">Выкладывайте задания, принимайте ответы, ставьте баллы.</p>
        </div>
        {mentorUnread.size > 0 && (
          <div className="flex items-center gap-2 rounded-2xl bg-alfa/10 px-4 py-2 text-sm font-bold text-alfa-ink">
            <MessageCircle size={16} /> Новых сообщений от команд: {mentorUnread.size}
          </div>
        )}
        <div className="rounded-2xl sf-1 px-4 py-2 text-center">
          <div className="font-display text-xl font-bold">{submittedCount}/{teams.length || 30}</div>
          <div className="text-xs font-semibold text-ink-soft">сдали ответ</div>
        </div>
      </div>

      {/* Выбор игры + публикация */}
      <div className="glass rounded-glass p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Игра сезона</span>
            <select
              value={gameId}
              onChange={(e) => changeGame(e.target.value)}
              className="field px-4 py-2.5 text-sm font-bold outline-none"
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  Игра {g.num}: {g.title}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={publish}
            disabled={publishing || !gameId || published || isPublished}
            className="btn-alfa ml-auto flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {publishing
              ? <><Loader2 size={16} className="animate-spin" /> Публикую…</>
              : (published || isPublished)
                ? <><Check size={16} /> Опубликовано на доске</>
                : <><Megaphone size={16} /> Выложить задание</>}
          </button>
        </div>
      </div>

      {/* Таблица оценивания */}
      <div className="glass-strong overflow-hidden rounded-glass">
        <div className="flex flex-col gap-1.5 border-b border-black/5 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
          <h2 className="font-display text-xl font-bold">Оценивание команд</h2>
          <div className="text-xs font-semibold text-ink-soft">
            Оценка за кейсы (общая, 0–3): 0 — не сдал · 1 — &gt;3 ошибок · 2 — &lt;3 ошибок · 3 — без ошибок
          </div>
        </div>

        {loading ? (
          <div className="grid h-40 place-items-center text-ink-soft" role="status" aria-live="polite">
            <Loader2 className="animate-spin" /><span className="sr-only">Загружаю команды…</span>
          </div>
        ) : (
          <>
          <div className="hidden max-h-[540px] overflow-auto lg:block">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 sf-3 backdrop-blur">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="px-5 py-2.5">Команда</th>
                  <th className="px-2 py-2.5 text-center">Сдала</th>
                  <th className="px-2 py-2.5 text-center">Очки за кейсы</th>
                  <th className="px-2 py-2.5 text-center">Бонус +1<br/><span className="font-normal normal-case text-[10px]">за нестандартное решение кейса</span></th>
                  <th className="px-2 py-2.5 text-center">VOC %<br/><span className="font-normal normal-case text-[10px]">справочно, в «Итог» не идёт</span></th>
                  <th className="px-2 py-2.5 text-center">Супер +3<br/>VOC<br/><span className="font-normal normal-case text-[10px]">+3 балла за лучший VOC</span></th>
                  <th className="px-2 py-2.5 text-left">ОС тренера</th>
                  <th className="px-4 py-2.5 text-right">Итог</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => (
                  <GradeRowDesktop
                    key={t.id}
                    t={t}
                    g={grades[t.id]}
                    hasAnswer={!!answers[t.id]}
                    unread={mentorUnread.has(t.id)}
                    onUpd={upd}
                    onChat={openTeamChat}
                    onView={setViewTeam}
                    onRoster={setRosterTeam}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Компактная раскладка карточками (мобайл + планшет-портрет до lg): таблица
              с min-w-[900px] на узком экране уходила бы в горизонтальный скролл. */}
          <div className="space-y-3 p-4 lg:hidden">
            {teams.map((t) => (
              <GradeCard
                key={t.id}
                t={t}
                g={grades[t.id]}
                hasAnswer={!!answers[t.id]}
                unread={mentorUnread.has(t.id)}
                onUpd={upd}
                onChat={openTeamChat}
                onView={setViewTeam}
                onRoster={setRosterTeam}
              />
            ))}
          </div>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            {saveError ? (
              <span className="font-semibold text-danger" role="alert">{saveError}</span>
            ) : (
              <span className="flex items-center gap-2 text-ink-soft">
                <Trophy size={16} style={{ color: 'var(--color-gold)' }} />
                После сохранения доска обновится при переключении на её вкладку.
              </span>
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={saveAll}
            disabled={loading || saving || !dirty}
            className="btn-alfa flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <><Check size={16} /> Баллы сохранены</> : <><RefreshCw size={16} /> Сохранить и обновить рейтинг</>}
          </motion.button>
        </div>
      </div>

      <MentorChatModal
        open={!!chatTeam}
        onClose={() => { if (chatTeam) { markMentorSeen(chatTeam.id); setSeenTick((n) => n + 1) } setChatTeam(null) }}
        teamId={chatTeam?.id ?? ''}
        teamName={chatTeam?.name ?? ''}
        asAdmin
      />

      <AnswerView
        team={viewTeam}
        data={viewTeam ? answers[viewTeam.id] : undefined}
        onClose={() => setViewTeam(null)}
      />

      <RosterView team={rosterTeam} onClose={() => setRosterTeam(null)} />

      <FeedbackPanel />
    </div>
  )
}

/** Просмотр состава команды тренером: имена + отметка капитана (read-only). */
function RosterView({ team, onClose }: { team: AdminTeamRow | null; onClose: () => void }) {
  const [roster, setRoster] = useState<RosterMember[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!team) { setRoster(null); return }
    let cancelled = false
    setRoster(null)
    setError(false)
    getRoster(team.id)
      .then((r) => { if (!cancelled) setRoster(r) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [team])

  return (
    <Dialog
      open={!!team}
      onClose={onClose}
      ariaLabel={`Состав команды ${team?.name ?? ''}`}
      panelClassName="w-full max-w-sm"
      title={<><Users size={17} className="shrink-0 text-alfa" /> <span className="truncate">Состав — {team?.name}</span></>}
    >
      <div className="max-h-[70vh] space-y-1.5 overflow-auto p-4 pt-2">
        {error && <p className="rounded-2xl sf-1 p-4 text-center text-sm font-semibold text-danger">Не удалось загрузить состав.</p>}
        {!error && roster === null && (
          <div className="grid h-24 place-items-center text-ink-soft" role="status" aria-live="polite"><Loader2 className="animate-spin" /><span className="sr-only">Загружаю состав…</span></div>
        )}
        {!error && roster !== null && roster.length === 0 && (
          <p className="rounded-2xl sf-1 p-4 text-center text-sm text-ink-soft">Команда ещё не добавила участников.</p>
        )}
        {!error && roster?.map((p) => (
          <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 sf-hoversoft">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full sf-2 text-xs font-bold">{p.name.slice(0, 1)}</span>
            <span className="flex-1 truncate text-sm font-semibold">{p.name}</span>
            {p.isCaptain && <Crown size={16} className="shrink-0 text-[var(--color-gold)]" aria-label="Капитан" />}
          </div>
        ))}
      </div>
    </Dialog>
  )
}

/** Просмотр ответа команды тренером: текст + скачивание файла (подписанная ссылка). */
function AnswerView({ team, data, onClose }: {
  team: AdminTeamRow | null
  data?: { answer: string; filePath: string | null }
  onClose: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const fileName = data?.filePath ? basename(data.filePath) : null

  // Сбрасываем ошибку при смене команды: AnswerView остаётся смонтированным между
  // открытиями (условен только Dialog внутри), иначе прошлая ошибка висела бы над новым ответом.
  useEffect(() => { setDownloadError('') }, [team])

  async function download() {
    if (!data?.filePath || downloading) return
    setDownloading(true)
    setDownloadError('')
    try {
      const url = await getAnswerFileUrl(data.filePath)
      if (url) window.open(url, '_blank', 'noopener')
      else setDownloadError('Не удалось получить ссылку на файл. Попробуйте ещё раз.')
    } catch {
      setDownloadError('Не удалось скачать файл. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog
      open={!!team}
      onClose={onClose}
      ariaLabel={`Ответ команды ${team?.name ?? ''}`}
      panelClassName="w-full max-w-lg"
      title={<><FileText size={17} className="shrink-0 text-alfa" /> <span className="truncate">Ответ — {team?.name}</span></>}
    >
      <div className="max-h-[70vh] space-y-3 overflow-auto p-4 pt-2">
        {data?.answer
          ? <p className="whitespace-pre-wrap rounded-2xl sf-1 p-4 text-sm">{data.answer}</p>
          : <p className="rounded-2xl sf-1 p-4 text-center text-sm text-ink-soft">Текстового ответа нет.</p>}
        {fileName && (
          <button
            onClick={download}
            disabled={downloading}
            className="btn-alfa flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="truncate">Скачать файл: {fileName}</span>
          </button>
        )}
        {downloadError && <p className="text-sm font-semibold text-danger" role="alert">{downloadError}</p>}
      </div>
    </Dialog>
  )
}

const CAT_ICON = { bug: Bug, question: HelpCircle, idea: Lightbulb } as const
const CAT_LABEL = { bug: 'Баг', question: 'Вопрос', idea: 'Идея' } as const

/** Отзывы тестировщиков (форма «Оставить отзыв» на сайте) — читает/меняет статус только админ. */
function FeedbackPanel() {
  const [items, setItems] = useState<FeedbackRow[] | null>(null)
  const [onlyNew, setOnlyNew] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')

  async function reload() {
    try {
      setFeedbackError('')
      setItems(await listFeedback())
    } catch {
      setItems([]) // не оставляем панель в вечном спиннере при сбое загрузки
      setFeedbackError('Не удалось загрузить отзывы. Обновите страницу.')
    }
  }
  useEffect(() => { reload() }, [])

  async function mark(id: string, status: FeedbackRow['status']) {
    setItems((prev) => prev?.map((f) => (f.id === id ? { ...f, status } : f)) ?? prev) // оптимистично
    try {
      await setFeedbackStatus(id, status)
    } catch {
      reload() // откат при ошибке
    }
  }

  const shown = items?.filter((f) => !onlyNew || f.status === 'new') ?? []
  const newCount = items?.filter((f) => f.status === 'new').length ?? 0

  return (
    <div className="glass-strong overflow-hidden rounded-glass">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold">
          <Bug size={18} className="text-alfa" /> Отзывы тестировщиков
          {newCount > 0 && (
            <span className="rounded-full bg-alfa px-2 py-0.5 text-xs font-bold text-white">{newCount} новых</span>
          )}
        </h2>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-soft">
          <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="h-4 w-4 accent-[var(--color-alfa)]" />
          Только новые
        </label>
      </div>

      {items === null ? (
        <div className="grid h-32 place-items-center text-ink-soft" role="status" aria-live="polite"><Loader2 className="animate-spin" /><span className="sr-only">Загружаю отзывы…</span></div>
      ) : feedbackError ? (
        <div className="p-8 text-center text-sm font-semibold text-danger" role="alert">{feedbackError}</div>
      ) : shown.length === 0 ? (
        <div className="p-8 text-center text-sm text-ink-soft">
          {items.length === 0 ? 'Пока никто ничего не написал.' : 'Новых отзывов нет.'}
        </div>
      ) : (
        <div className="max-h-[480px] space-y-3 overflow-auto p-4">
          {shown.map((f) => {
            const Icon = CAT_ICON[f.category]
            return (
              <div key={f.id} className={`rounded-2xl p-4 ${f.status === 'new' ? 'sf-2 ring-1 ring-alfa/30' : 'sf-1'}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink-soft">
                  <span className="flex items-center gap-1 rounded-full sf-3 px-2 py-1 text-ink">
                    <Icon size={12} /> {CAT_LABEL[f.category]}
                  </span>
                  <span>{f.author} · {f.teamName}</span>
                  <span className="ml-auto">{f.createdAt}</span>
                </div>
                <p className="mt-2 text-sm"><b>Что делал:</b> {f.did}</p>
                {f.expected && <p className="mt-0.5 text-sm text-ink-soft"><b>Ожидал:</b> {f.expected}</p>}
                {f.got && <p className="mt-0.5 text-sm text-ink-soft"><b>Получил:</b> {f.got}</p>}
                {f.device && <p className="mt-0.5 text-xs text-ink-soft">Устройство: {f.device}</p>}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => mark(f.id, 'seen')}
                    disabled={f.status !== 'new'}
                    className="flex items-center gap-1.5 rounded-xl sf-3 px-3 py-1.5 text-xs font-bold transition-colors sf-hover disabled:opacity-40"
                  >
                    <Eye size={13} /> Увидел
                  </button>
                  <button
                    onClick={() => mark(f.id, 'fixed')}
                    disabled={f.status === 'fixed'}
                    className="flex items-center gap-1.5 rounded-xl bg-success/15 px-3 py-1.5 text-xs font-bold text-success transition-colors hover:bg-success/25 disabled:opacity-40"
                  >
                    <CheckCheck size={13} /> Исправлено
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Строка таблицы оценивания (desktop), мемоизированная: перерисовывается только та
 *  команда, чей grade изменился, а не все ~30 строк на каждый ввод символа. Опирается
 *  на СТАБИЛЬНЫЕ пропсы onUpd/onChat/onView (см. useCallback/setState в Admin). */
const GradeRowDesktop = memo(function GradeRowDesktop({
  t, g, hasAnswer, unread, onUpd, onChat, onView, onRoster,
}: {
  t: AdminTeamRow
  g: Grade
  hasAnswer: boolean
  unread: boolean
  onUpd: (id: string, patch: Partial<Grade>) => void
  onChat: (t: AdminTeamRow) => void
  onView: (t: AdminTeamRow) => void
  onRoster: (t: AdminTeamRow) => void
}) {
  const sum = gradeTotal(g)
  const onChange = (patch: Partial<Grade>) => onUpd(t.id, patch)
  return (
    <tr className="border-t border-black/5 sf-hoversoft">
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold" style={{ background: teamAvatar(t.hue).bg, color: teamAvatar(t.hue).fg }}>
            {t.name.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold">{t.name}</div>
            <div className="text-xs text-ink-soft">{t.code} · {t.site}</div>
          </div>
          <button
            onClick={() => onRoster(t)}
            aria-label={`Состав команды ${t.name}`}
            title="Состав команды"
            className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => onView(t)}
            disabled={!hasAnswer}
            aria-label={`Ответ команды ${t.name}`}
            title={hasAnswer ? 'Посмотреть ответ команды' : 'Команда ещё не сдала ответ'}
            className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa disabled:opacity-30"
          >
            <FileText size={16} />
          </button>
          <button
            onClick={() => onChat(t)}
            aria-label={unread ? `Чат с командой ${t.name} — новое сообщение` : `Чат с командой ${t.name}`}
            title={unread ? 'Новое сообщение от команды' : 'Чат с командой'}
            className="tap relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa"
          >
            <MessageCircle size={16} />
            {unread && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-alfa ring-2 ring-white" />}
          </button>
        </div>
      </td>
      <td className="px-2 text-center">
        <input
          type="checkbox"
          checked={g.submitted}
          disabled={hasAnswer}
          title={hasAnswer ? 'Команда сдала ответ — снять нельзя (иначе сохранение обнулило бы её оценку)' : undefined}
          onChange={(e) => onChange({ submitted: e.target.checked })}
          className="h-5 w-5 accent-[var(--color-alfa)] disabled:cursor-not-allowed"
        />
      </td>
      <td className="px-2 text-center">
        <input
          type="number" min={0} max={3}
          value={g.cases}
          disabled={!g.submitted}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange({ cases: clampNum(e.target.value, 3) })}
          className="w-16 rounded-lg border border-black/10 sf-3 px-2 py-1 text-center font-bold outline-none focus:border-alfa/50 disabled:opacity-40"
        />
      </td>
      <td className="px-2 text-center">
        <input type="checkbox" checked={g.bonus} disabled={!g.submitted} onChange={(e) => onChange({ bonus: e.target.checked })} className="h-5 w-5 accent-[var(--color-alfa)] disabled:opacity-40" />
      </td>
      <td className="px-2 text-center">
        <input
          type="number" min={0} max={100}
          value={g.vok}
          disabled={!g.submitted}
          title="Индекс качества обслуживания (VOC). На «Итог» напрямую не влияет — учитывается через галочку «Супер +3 VOC»."
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange({ vok: clampNum(e.target.value, 100) })}
          className="w-16 rounded-lg border border-black/10 sf-3 px-2 py-1 text-center font-bold outline-none focus:border-alfa/50 disabled:opacity-40"
        />
      </td>
      <td className="px-2 text-center">
        <input type="checkbox" checked={g.superBonusVok} disabled={!g.submitted} onChange={(e) => onChange({ superBonusVok: e.target.checked })} className="h-5 w-5 accent-[var(--color-gold)] disabled:opacity-40" />
      </td>
      <td className="px-2">
        <input
          value={g.feedback}
          disabled={!g.submitted}
          onChange={(e) => onChange({ feedback: e.target.value })}
          placeholder="комментарий команде…"
          className="w-52 rounded-lg border border-black/10 sf-3 px-2 py-1 text-xs outline-none focus:border-alfa/50 disabled:opacity-40"
        />
      </td>
      <td className="px-4 text-right text-base font-bold">{sum}</td>
    </tr>
  )
})

/** Карточка оценивания одной команды для мобильной раскладки (замена строки таблицы). */
const GradeCard = memo(function GradeCard({
  t, g, hasAnswer, unread, onUpd, onChat, onView, onRoster,
}: {
  t: AdminTeamRow
  g: Grade
  hasAnswer: boolean
  unread: boolean
  onUpd: (id: string, patch: Partial<Grade>) => void
  onChat: (t: AdminTeamRow) => void
  onView: (t: AdminTeamRow) => void
  onRoster: (t: AdminTeamRow) => void
}) {
  const sum = gradeTotal(g)
  const onChange = (patch: Partial<Grade>) => onUpd(t.id, patch)
  const fieldCls =
    'w-full rounded-lg border border-black/10 sf-3 px-2 py-1.5 text-center font-bold outline-none focus:border-alfa/50 disabled:opacity-40'
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-extrabold"
          style={{ background: teamAvatar(t.hue).bg, color: teamAvatar(t.hue).fg }}
        >
          {t.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{t.name}</div>
          <div className="text-xs text-ink-soft">{t.code} · {t.site}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-ink-soft">Итог</div>
          <div className="text-lg font-bold leading-none">{sum}</div>
        </div>
        <button
          onClick={() => onRoster(t)}
          aria-label={`Состав команды ${t.name}`}
          title="Состав команды"
          className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa"
        >
          <Users size={16} />
        </button>
        <button
          onClick={() => onView(t)}
          disabled={!hasAnswer}
          aria-label={`Ответ команды ${t.name}`}
          title={hasAnswer ? 'Посмотреть ответ команды' : 'Команда ещё не сдала ответ'}
          className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa disabled:opacity-30"
        >
          <FileText size={16} />
        </button>
        <button
          onClick={() => onChat(t)}
          aria-label={unread ? `Чат с командой ${t.name} — новое сообщение` : `Чат с командой ${t.name}`}
          className="tap relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa"
        >
          <MessageCircle size={16} />
          {unread && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-alfa ring-2 ring-white" />}
        </button>
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl sf-1 px-3 py-2">
        <span className="text-sm font-semibold">Команда сдала ответ</span>
        <input
          type="checkbox"
          checked={g.submitted}
          disabled={hasAnswer}
          title={hasAnswer ? 'Команда сдала ответ — снять нельзя (иначе сохранение обнулило бы её оценку)' : undefined}
          onChange={(e) => onChange({ submitted: e.target.checked })}
          className="h-5 w-5 accent-[var(--color-alfa)] disabled:cursor-not-allowed"
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Очки за кейсы</span>
          <input
            type="number" min={0} max={3}
            value={g.cases}
            disabled={!g.submitted}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onChange({ cases: clampNum(e.target.value, 3) })}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">VOC %<br/><span className="normal-case font-normal text-[10px] tracking-normal">справочно, в «Итог» не идёт</span></span>
          <input
            type="number" min={0} max={100}
            value={g.vok}
            disabled={!g.submitted}
            title="Индекс качества обслуживания (VOC). На «Итог» напрямую не влияет — учитывается через галочку «Супер +3 VOC»."
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onChange({ vok: clampNum(e.target.value, 100) })}
            className={fieldCls}
          />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 rounded-lg sf-1 px-3 py-2 text-sm font-semibold">
          <span className="leading-tight">Бонус&nbsp;+1<br/><span className="text-[11px] font-normal text-ink-soft">за нестандартное решение кейса</span></span>
          <input type="checkbox" checked={g.bonus} disabled={!g.submitted} onChange={(e) => onChange({ bonus: e.target.checked })} className="h-5 w-5 accent-[var(--color-alfa)] disabled:opacity-40" />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-lg sf-1 px-3 py-2 text-sm font-semibold">
          <span className="leading-tight">Супер&nbsp;+3<br/><span className="text-[11px] text-ink-soft">VOC</span></span>
          <input type="checkbox" checked={g.superBonusVok} disabled={!g.submitted} onChange={(e) => onChange({ superBonusVok: e.target.checked })} className="h-5 w-5 accent-[var(--color-gold)] disabled:opacity-40" />
        </label>
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">ОС тренера</span>
        <input
          value={g.feedback}
          disabled={!g.submitted}
          onChange={(e) => onChange({ feedback: e.target.value })}
          placeholder="комментарий команде…"
          className="w-full rounded-lg border border-black/10 sf-3 px-3 py-2 text-sm outline-none focus:border-alfa/50 disabled:opacity-40"
        />
      </label>
    </div>
  )
})
