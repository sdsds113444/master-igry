import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Play, FileDown, Upload, Send, MessageCircle, CheckCircle2, Clock,
  UserPlus, X, MessageSquare, Loader2, Pencil, ChevronDown, Crown, ExternalLink, ZoomIn, Check, Download,
} from 'lucide-react'
import {
  GAME_VIDEO, GAME_FILE,
  type TeamScore, type CaseItem, type Game,
} from '../data/mock'
import {
  resolveMyTeam, signOut, listTeamsRating, getRoster, addPlayer as dbAddPlayer, removePlayer as dbRemovePlayer,
  renamePlayer as dbRenamePlayer,
  getCases, getScores, getSubmission, submitAnswer, getGames, pickCurrentGame, getAnswerFileUrl,
  getMentorLatestFromTrainer, getMentorSeen, markMentorSeen, setCaptain as dbSetCaptain,
  type TeamInfo, type RosterMember,
} from '../lib/db'

/** Максимум игроков в составе команды (фиксированный размер — честное начисление). */
const ROSTER_LIMIT = 10
import { rankTier, rankPercent, DEADLINE, diffBadge, teamAvatar, basename } from '../lib/ui'
import { teamTotal } from '../lib/scoring'
import { playPing } from '../lib/ping'
import VideoModal from '../components/VideoModal'
import MentorChatModal from '../components/MentorChatModal'
import ImageLightbox from '../components/ImageLightbox'
import ChatThread from '../components/ChatThread'
import Badge from '../components/Badge'
import ErrorCard from '../components/ErrorCard'
import Icon3D, { EMOJI_ICON_3D, GAME_ICON_3D } from '../components/Icon3D'

/** Есть ли в тексте хоть одна буква или цифра. Одни знаки препинания/пробелы (например
 *  случайная запятая на мобильной клавиатуре) ответом НЕ считаются — иначе такой «ответ»
 *  проходил как сдача и показывал тренеру мусорную «точку». */
function hasMeaningfulText(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s)
}

/** Реальная сдача = есть осмысленный текст ИЛИ прикреплённый файл. Пустая строка в
 *  answers (напр. выбрали файл, а его загрузку заблокировал корпоративный контур, и
 *  текста не было) сдачей НЕ считается — иначе при следующем заходе кабинет показывал бы
 *  ложное «Ответ отправлен» на пустой заготовке, хотя команде сдавать ещё нечего. */
function isRealSubmission(answer: string, fileName: string | null): boolean {
  return hasMeaningfulText(answer) || !!fileName
}

/** Кнопка скачивания файла обратной связи от тренера (разбор кейсов). Тянет файл по
 *  подписанной ссылке и отдаёт как локальный blob — тем же способом, что тренер в
 *  админке: window.open после await теряет «жест пользователя» и режется блокировщиком. */
function FeedbackFileDownload({ filePath, fileName }: { filePath: string; fileName: string | null }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')
  const name = fileName ?? basename(filePath)
  async function download() {
    if (downloading) return
    setDownloading(true)
    setError('')
    try {
      const url = await getAnswerFileUrl(filePath)
      if (!url) { setError('Не удалось получить ссылку на файл. Попробуйте ещё раз.'); return }
      const res = await fetch(url)
      if (!res.ok) throw new Error(`http ${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 10000)
    } catch {
      setError('Не удалось скачать файл. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setDownloading(false)
    }
  }
  return (
    <div className="mt-2">
      <button
        onClick={download}
        disabled={downloading}
        className="flex max-w-full items-center gap-2 rounded-xl bg-alfa/10 px-3 py-2 text-xs font-bold text-alfa-ink transition-colors hover:bg-alfa/20 disabled:opacity-60"
      >
        {downloading ? <Loader2 size={14} className="shrink-0 animate-spin" /> : <Download size={14} className="shrink-0" />}
        <span className="truncate">Файл от тренера: {name}</span>
      </button>
      {error && <p className="mt-1 text-xs font-semibold text-danger" role="alert">{error}</p>}
    </div>
  )
}

export default function TeamCabinet() {
  const navigate = useNavigate()
  const [me, setMe] = useState<TeamInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  // Игрок вошёл, но команду не удалось подтвердить даже после перепривязки по коду
  // (рассинхрон анонимной сессии — банковский контур). Честно уводим на вход, а не
  // показываем ложное «вы администратор».
  const [sessionBroken, setSessionBroken] = useState(false)
  const [rank, setRank] = useState(1)
  const [total, setTotal] = useState(0)
  const [teamsCount, setTeamsCount] = useState(30) // фактическое число команд — для границ тира/процента

  const [videoOpen, setVideoOpen] = useState(false)
  const [mentorChatOpen, setMentorChatOpen] = useState(false)
  const [mentorUnread, setMentorUnread] = useState(false) // «пипочка»: новый ответ тренера

  const [games, setGames] = useState<Game[]>([])
  const [current, setCurrent] = useState<Game | null>(null)
  const [cases, setCases] = useState<CaseItem[]>([])
  const [openCases, setOpenCases] = useState<Set<string>>(new Set()) // раскрытые кейсы (аккордеон)
  const [zoomImage, setZoomImage] = useState<string | null>(null) // скриншот кейса на весь экран
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
  const [editingId, setEditingId] = useState<string | null>(null) // чьё ФИО правим прямо сейчас
  const [editName, setEditName] = useState('')
  // id игры, чьи кейсы/ответ сейчас загружены — чтобы фоновый refresh заметил смену недели.
  const loadedGameId = useRef<string | null>(null)
  // Время последнего ответа тренера с прошлой проверки — источник звука о новом ответе.
  const prevMentorLatest = useRef<number | null>(null)
  // Открыт ли чат с тренером прямо сейчас (ref, а не state: читается из фонового опроса).
  const mentorChatOpenRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // resolveMyTeam и getGames независимы — грузим параллельно (был водопад из трёх
        // последовательных сетевых раундов). resolveMyTeam сам лечит рассинхрон анонимной
        // сессии (перепривязка по сохранённому коду), поэтому здесь только разбор итога.
        const [teamRes, gs] = await Promise.all([resolveMyTeam(), getGames()])
        if (cancelled) return

        // Игрок, но команда не подтвердилась даже после перепривязки — на экран входа.
        if (teamRes.status === 'broken') { setSessionBroken(true); return }
        // Настоящий администратор — корректный текст «только для команд» покажет рендер.
        if (teamRes.status === 'admin') { setMe(null); return }
        const team = teamRes.team
        setMe(team)

        const cur = pickCurrentGame(gs)
        // Состав, рейтинг и баллы НЕ зависят от текущей игры — грузим их всегда, в том
        // числе в пресезоне (капитан регистрирует состав именно до старта). Кейсы и ранее
        // сданный ответ есть только у активной игры, поэтому их тянем условно.
        const [rating, r, s, c, sub] = await Promise.all([
          listTeamsRating(),
          getRoster(team.id),
          getScores(team.id),
          cur ? getCases(cur.id) : Promise.resolve([]),
          cur ? getSubmission(team.id, cur.id) : Promise.resolve(null),
        ])
        if (cancelled) return

        const mine = rating.find((x) => x.id === team.id)
        setRank(mine?.rank ?? 1)
        setTotal(mine?.total ?? 0)
        setTeamsCount(rating.length || 30)
        setGames(gs)
        setCurrent(cur)
        loadedGameId.current = cur?.id ?? null
        setRoster(r)
        setScores(s)
        setCases(c)
        if (sub) { setAnswer(sub.answer); setFileAttached(sub.fileName); setSent(isRealSubmission(sub.answer, sub.fileName)) }
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

  // «Пипочка»: новый ответ тренера → красная точка на кнопке «Написать тренеру».
  // Опрос раз в 45с (не критична секундная свежесть, важно не грузить бесплатный
  // тариф Supabase лишними запросами) + при возврате на вкладку.
  useEffect(() => {
    if (!me) return
    let stopped = false
    async function check() {
      // Гейта по visibilityState здесь НЕТ намеренно: смысл звука — сработать, когда
      // команда смотрит в другое окно (иначе уведомление приходило бы ровно тогда,
      // когда на него и так смотрят).
      try {
        const latest = await getMentorLatestFromTrainer(me!.id)
        if (stopped) return
        const unread = latest > getMentorSeen(me!.id)
        setMentorUnread(unread)
        // Звук — только на НОВЫЙ ответ тренера и только если чат закрыт: если он открыт,
        // сообщение и так видно вживую (и ChatThread пингует сам).
        if (prevMentorLatest.current !== null && latest > prevMentorLatest.current
            && unread && !mentorChatOpenRef.current) playPing()
        prevMentorLatest.current = latest
      } catch { /* тихо: фоновая проверка */ }
    }
    check()
    const timer = window.setInterval(check, 45000)
    window.addEventListener('focus', check)
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [me])

  // Тихо обновляем место/очки/оценки при возврате на вкладку и по таймеру (как на доске) —
  // иначе после проверки тренером кабинет показывал бы устаревшие данные до перезагрузки.
  useEffect(() => {
    if (!me) return
    let refreshing = false
    async function refresh() {
      if (document.visibilityState !== 'visible' || refreshing) return
      refreshing = true
      try {
        const [rating, s, gs] = await Promise.all([listTeamsRating(), getScores(me!.id), getGames()])
        const mine = rating.find((x) => x.id === me!.id)
        setRank(mine?.rank ?? 1)
        setTotal(mine?.total ?? 0)
        setTeamsCount(rating.length || 30)
        setScores(s)
        setGames(gs)
        const cur = pickCurrentGame(gs)
        setCurrent(cur)
        // Сменилась активная игра (опубликовали следующую неделю) — подтягиваем её кейсы и
        // ранее сданный ответ. Иначе кабинет висел бы со старым заданием, а повторная сдача
        // падала бы с ложной «ошибкой сети» (RLS не пускает ответ в уже закрытую игру).
        if ((cur?.id ?? null) !== loadedGameId.current) {
          loadedGameId.current = cur?.id ?? null
          const [c, sub] = await Promise.all([
            cur ? getCases(cur.id) : Promise.resolve([]),
            cur ? getSubmission(me!.id, cur.id) : Promise.resolve(null),
          ])
          setCases(c)
          setOpenCases(new Set())
          if (sub) { setAnswer(sub.answer); setFileAttached(sub.fileName); setSent(isRealSubmission(sub.answer, sub.fileName)) }
          else { setAnswer(''); setFileAttached(null); setSent(false) }
          setFile(null)
        }
      } catch { /* фоновое обновление — тихо */ } finally { refreshing = false }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 4 * 60 * 1000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [me])

  // Пометить чат с тренером прочитанным СЕРВЕРНЫМ временем последнего его сообщения
  // (а не Date.now() клиента) — иначе «пипочка» врёт при сбитых часах устройства.
  async function markMentorRead() {
    if (!me) return
    let ts = Date.now()
    try { ts = await getMentorLatestFromTrainer(me.id) } catch { /* оставляем Date.now() */ }
    markMentorSeen(me.id, ts)
  }

  // Открыть чат с тренером: сразу гасим точку, прочитанное фиксируем серверным временем.
  function openMentorChat() {
    setMentorUnread(false)
    mentorChatOpenRef.current = true
    setMentorChatOpen(true)
    void markMentorRead()
  }

  const tier = rankTier(rank, teamsCount)
  const rankProgress = rankPercent(rank, teamsCount)
  const seasonStarted = games.some((g) => g.status === 'current' || g.status === 'done')

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    const name = newPlayer.trim()
    if (!name || !me) return
    setRosterError('')
    if (roster.length >= ROSTER_LIMIT) {
      setRosterError(`В команде максимум ${ROSTER_LIMIT} человек.`)
      return
    }
    // Дубли имён визуально неразличимы (аватар — первая буква) — предупреждаем.
    if (roster.some((p) => p.name.trim().toLowerCase() === name.toLowerCase())) {
      setRosterError('Игрок с таким именем уже в составе.')
      return
    }
    // Оптимистично показываем с временным id, затем заменяем на строку из БД
    // (с настоящим id) — откат тоже по id, а не по имени, чтобы не задеть тёзку.
    const tempId = `tmp-${Date.now()}`
    setRoster((r) => [...r, { id: tempId, name, isCaptain: false }])
    setNewPlayer('')
    try {
      const created = await dbAddPlayer(me.id, name)
      setRoster((r) => r.map((p) => (p.id === tempId ? created : p)))
    } catch (err) {
      setRoster((r) => r.filter((p) => p.id !== tempId)) // откат оптимистичного добавления
      const full = String((err as { message?: string })?.message ?? '').includes('roster_full')
      setRosterError(full
        ? `В команде максимум ${ROSTER_LIMIT} человек.`
        : 'Не удалось добавить игрока — попробуйте ещё раз.')
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

  function startEdit(member: RosterMember) {
    setRosterError('')
    setEditingId(member.id)
    setEditName(member.name)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  /** Сохранить исправленное ФИО. Правки по id строки — тёзки не путаются. */
  async function saveEdit(member: RosterMember) {
    if (!me) return
    const name = editName.trim()
    if (!name) { setRosterError('Имя не может быть пустым.'); return }
    if (name === member.name) { cancelEdit(); return } // ничего не поменяли — молча закрываем
    // Та же проверка на дубли, что и при добавлении, но себя в расчёт не берём.
    if (roster.some((p) => p.id !== member.id && p.name.trim().toLowerCase() === name.toLowerCase())) {
      setRosterError('Игрок с таким именем уже в составе.')
      return
    }
    const prev = roster
    setRosterError('')
    setRoster((r) => r.map((p) => (p.id === member.id ? { ...p, name } : p)))
    cancelEdit()
    try {
      await dbRenamePlayer(me.id, member.id, name)
    } catch {
      setRoster(prev) // откат: возвращаем прежнее имя
      setRosterError('Не удалось изменить имя — попробуйте ещё раз.')
    }
  }

  async function makeCaptain(member: RosterMember) {
    if (!me || member.isCaptain) return
    const prev = roster
    setRosterError('')
    setRoster((r) => r.map((p) => ({ ...p, isCaptain: p.id === member.id })))
    try {
      await dbSetCaptain(me.id, member.id)
    } catch {
      setRoster(prev) // откат
      setRosterError('Не удалось назначить капитана — попробуйте ещё раз.')
    }
  }

  // Есть что сдавать: ОСМЫСЛЕННЫЙ текст (буква/цифра, а не одни знаки препинания),
  // новый файл или ранее прикреплённый файл. Иначе случайная запятая проходила как
  // «сдача» и создавала мусорную строку в answers, а админка считала её «сдано».
  const canSubmit = hasMeaningfulText(answer) || !!file || !!fileAttached

  async function sendAnswer() {
    if (!me || !current || sending || !canSubmit) return // guard от двойной/пустой отправки
    setSendError('')
    setSending(true)
    try {
      // Реально загружаем файл (если выбран) в Storage и сохраняем ответ.
      const res = await submitAnswer({ teamId: me.id, gameId: current.id, answer, file })
      const hadFile = !!file
      // Подтверждаем, что реально сохранилось (сбой чтения не критичен — upsert уже прошёл).
      try {
        const fresh = await getSubmission(me.id, current.id)
        if (fresh) { setAnswer(fresh.answer); setFileAttached(fresh.fileName) }
      } catch { /* данные не потеряны */ }
      if (hadFile && !res.fileUploaded) {
        // Текст сохранён, а файл — нет. НЕ показываем зелёный «отправлено» (иначе экран
        // одновременно «успех» и «ошибка»): держим форму открытой (sent остаётся false),
        // чтобы капитан прикрепил файл повторно. Текст уже в БД — не потеряется.
        setSendError(hasMeaningfulText(answer)
          ? 'Текст сохранён, но файл не прикрепился. Прикрепите его ещё раз и нажмите «Отправить».'
          : 'Файл не удалось прикрепить (возможно, запрет вашей организации). Впишите ответ текстом — это тоже засчитывается, либо приложите файл ещё раз.')
        return
      }
      setFile(null)
      setSent(true) // полный успех: текст (и файл, если был) сохранены
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

  // Игрок с рассинхронённой сессией: команда на месте, но анонимный вход не подтвердился
  // (частый случай — корпоративная сеть банка). Честное «войдите заново», а НЕ ложное
  // «вы администратор». Кнопка чистит локальную сессию и уводит на экран входа.
  if (sessionBroken) {
    return (
      <div className="glass rounded-glass p-8 text-center">
        <p className="font-display text-lg font-bold">Нужно войти заново</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
          Не получилось подтвердить вход команды — так бывает из-за корпоративной сети.
          Данные на месте, просто войдите ещё раз по коду команды.
        </p>
        <button
          type="button"
          onClick={() => { void signOut().then(() => navigate('/', { replace: true })) }}
          className="tap mt-4 rounded-full bg-alfa px-5 py-2.5 text-sm font-bold text-white shadow sf-hover"
        >
          Войти заново
        </button>
      </div>
    )
  }

  if (!me) {
    return (
      <div className="glass rounded-glass p-8 text-center">
        <p className="font-display text-lg font-bold">Эта страница только для команд</p>
        <p className="mt-1 text-sm text-ink-soft">Вы вошли как администратор — у вас нет своего кабинета команды.</p>
      </div>
    )
  }

  // current может быть null до старта сезона (все игры locked): кабинет всё равно
  // работает — состав и чат команды доступны, а блок задания показывает «скоро».
  const videoTitle = current ? `Мультик КОЯ — ${current.title}` : ''
  // Ассеты из БД (video_url/file_url), с откатом на статичные карты и защитой от undefined.
  const videoSrc = current ? (current.video_url || GAME_VIDEO[current.id] || '') : ''
  const casesHref = current ? (current.file_url || GAME_FILE[current.id] || '') : ''
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
            {me.site}
          </div>
        </div>
        <div className="flex gap-3">
          <Stat label="Место" value={`#${rank}`} />
          <Stat label="Очки" value={total} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="https://xlink.achat.best/join/chat/NGM0ODFlNWYtNDU3NS01ZGVlLThiYTctMTgxYTM0YzE5NDE3OjI1MjE3Yzk1LTY3YTYtNTcxYS1hMzM0LWViMDFiZDExY2M2ODo1ODZkMmYxYy04MjA2LTVmM2MtODA4ZC1hOTU2YWFhMjk5ZTg6OWMzMmUzMTctZWUxNi01ZDI1LTlmZGYtODkzNTUxMGM3NmEy"
            target="_blank"
            rel="noreferrer"
            title="Общий чат площадки в мессенджере — откроется в новой вкладке"
            className="flex items-center gap-2 rounded-2xl sf-2 px-4 py-2.5 text-sm font-bold text-ink transition-colors sf-hover"
          >
            <MessageCircle size={16} /> Общий чат <ExternalLink size={13} className="opacity-60" />
          </a>
          <button
            onClick={openMentorChat}
            className="btn-alfa relative flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold"
          >
            <Send size={16} /> Написать тренеру
            {mentorUnread && (
              <span
                className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-alfa ring-2 ring-white"
                aria-label="Новый ответ тренера"
              />
            )}
          </button>
        </div>
      </motion.div>

      <MentorChatModal
        open={mentorChatOpen}
        onClose={() => {
          setMentorUnread(false)
          mentorChatOpenRef.current = false
          setMentorChatOpen(false)
          void markMentorRead()
        }}
        teamId={me.id}
        teamName={me.name}
      />

      <ImageLightbox
        open={!!zoomImage}
        onClose={() => setZoomImage(null)}
        src={zoomImage ?? ''}
        alt="Скриншот к кейсу"
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* ==== ЛЕВАЯ КОЛОНКА ==== */}
        <section className="space-y-4">
          {current ? (
          <>
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
                  {open && (
                    <div className="px-4 pb-4">
                      <p className="text-sm text-ink-soft">{c.text}</p>
                      {c.image && (
                        <button
                          type="button"
                          onClick={() => setZoomImage(c.image!)}
                          className="tap group relative mt-3 block w-full overflow-hidden rounded-2xl border border-black/5 shadow-sm"
                          aria-label="Открыть скриншот на весь экран"
                        >
                          <img src={c.image} alt="Скриншот к кейсу" className="w-full" loading="lazy" />
                          <span className="absolute inset-0 hidden items-center justify-center bg-black/40 transition-opacity group-hover:flex">
                            <span className="grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink">
                              <ZoomIn size={18} />
                            </span>
                          </span>
                        </button>
                      )}
                    </div>
                  )}
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
                  <CheckCircle2 className="shrink-0" /> Ответ отправлен тренеру! Ждите обратную связь.
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
                  <label className="tap flex max-w-full cursor-pointer items-center gap-2 rounded-2xl sf-2 px-4 py-2.5 text-sm font-bold transition-colors sf-hover focus-within:ring-2 focus-within:ring-alfa">
                    <Upload size={16} className="shrink-0" />
                    <span className="truncate">
                      {fileAttached ? fileAttached : 'Прикрепить заполненный файл'}
                    </span>
                    {/* sr-only (а не hidden/display:none): input остаётся в tab-порядке и
                        фокусируется с клавиатуры; фокус виден на label через focus-within. */}
                    <input
                      type="file"
                      accept=".xlsx,.xls,.pdf,.doc,.docx"
                      className="sr-only"
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
          </>
          ) : (
            <div className="glass rounded-glass p-6 text-center">
              <h2 className="font-display text-xl font-extrabold">Задание недели скоро появится</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Мультик и кейсы откроются, когда организатор запустит игру недели.
                А пока соберите состав команды и обсудите всё в чате.
              </p>
            </div>
          )}

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
                {seasonStarted ? (
                  <>
                    <div className="font-display text-3xl font-extrabold leading-none">
                      #{rank}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-sm font-bold" style={{ color: tier.textColor }}>
                      <Icon3D name={EMOJI_ICON_3D[tier.emoji]} fallback={tier.emoji} className="h-5 w-5 object-contain drop-shadow-sm" /> {tier.label}
                    </div>
                    <div className="mt-2 h-2 w-full max-w-[140px] overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                      <div className="h-full rounded-full transition-[width]" style={{ width: `${rankProgress}%`, background: tier.color }} />
                    </div>
                    <div className="mt-1 text-xs font-semibold text-ink-soft">
                      из {teamsCount} команд
                    </div>
                  </>
                ) : (
                  // До старта у всех 0 очков, ранг (алфавитный) ничего не значит — не показываем
                  // «#1 · Топ-3 · 100%», это вводило бы команду в заблуждение.
                  <div className="mt-1.5 max-w-[150px] text-sm font-semibold text-ink-soft">
                    Появится после первой игры
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Состав */}
          <div className="glass rounded-glass p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold">Состав команды</h3>
              <span className="rounded-full sf-2 px-2.5 py-1 text-xs font-bold text-ink-soft">
                {roster.length} / {ROSTER_LIMIT}
              </span>
            </div>
            <ul className="space-y-1.5">
              {roster.map((p) => (
                <li key={p.id} className="group flex items-center gap-2.5 rounded-xl px-2 py-1 sf-hoversoft">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full sf-2 text-xs font-bold">{p.name.slice(0, 1)}</span>
                  {editingId === p.id ? (
                    // Режим правки ФИО: Enter — сохранить, Esc — отменить.
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void saveEdit(p) }
                          if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                        }}
                        autoFocus
                        aria-label={`Фамилия и имя игрока ${p.name}`}
                        className="field min-w-0 flex-1 px-2.5 py-1.5 text-sm outline-none"
                      />
                      <button
                        onClick={() => void saveEdit(p)}
                        aria-label="Сохранить имя"
                        title="Сохранить"
                        className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-success transition-colors hover:bg-success/10 focus-visible:bg-success/10"
                      >
                        <Check size={16} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        aria-label="Отменить"
                        title="Отменить"
                        className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa focus-visible:bg-alfa/10 focus-visible:text-alfa"
                      >
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-semibold">{p.name}</span>
                      {/* Карандаш есть и у капитана: опечатка в ФИО возможна у любого,
                          а удалять и заводить человека заново — потерять флаг капитана. */}
                      <button
                        onClick={() => startEdit(p)}
                        aria-label={`Изменить имя ${p.name}`}
                        title="Изменить имя"
                        className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa focus-visible:bg-alfa/10 focus-visible:text-alfa"
                      >
                        <Pencil size={15} />
                      </button>
                      {p.isCaptain ? (
                        <span className="grid h-9 w-9 place-items-center" title="Капитан">
                          <Icon3D name="crown" className="h-7 w-7 object-contain drop-shadow-sm" />
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => makeCaptain(p)}
                            aria-label={`Сделать капитаном ${p.name}`}
                            title="Сделать капитаном"
                            className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa focus-visible:bg-alfa/10 focus-visible:text-alfa"
                          >
                            <Crown size={16} />
                          </button>
                          <button
                            onClick={() => removePlayer(p)}
                            aria-label={`Убрать игрока ${p.name}`}
                            title="Убрать игрока"
                            className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa focus-visible:bg-alfa/10 focus-visible:text-alfa"
                          >
                            <X size={16} />
                          </button>
                        </>
                      )}
                    </>
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
                placeholder={roster.length >= ROSTER_LIMIT ? 'Состав заполнен' : 'Имя игрока…'}
                disabled={roster.length >= ROSTER_LIMIT}
                className="field flex-1 px-3 py-2 text-sm outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={roster.length >= ROSTER_LIMIT}
                className="btn-alfa flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold disabled:opacity-50"
              >
                <UserPlus size={15} /> Добавить
              </button>
            </form>
            {rosterError && <p className="mt-2 text-xs font-semibold text-danger" role="alert">{rosterError}</p>}
            <p className="mt-2 text-xs text-ink-soft">
              {roster.length >= ROSTER_LIMIT
                ? `Набрано ${ROSTER_LIMIT} из ${ROSTER_LIMIT} — это максимум состава.`
                : `Капитан регистрирует состав команды (до ${ROSTER_LIMIT} человек).`}
            </p>
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
                const sum = teamTotal({ cases: s.cases, bonus: s.bonus, superBonusVok: superVok })
                return (
                  <div key={g.id} className="rounded-2xl sf-1 p-3">
                    <div className="flex items-center gap-3">
                      <Icon3D name={GAME_ICON_3D[g.id]} fallback={g.emoji} className="h-8 w-8 shrink-0 object-contain drop-shadow-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold">{g.title}</div>
                        <div className="text-xs font-semibold text-ink-soft">
                          кейсы {s.cases}
                          {s.bonus > 0 && ` · бонус +${s.bonus}`}
                          {superVok > 0 && ` · супер VOC +${superVok}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-base font-bold">
                        {sum > 0 ? sum : '—'}
                        {superVok > 0 && <Icon3D name="star" className="h-4 w-4 object-contain drop-shadow-sm" />}
                      </div>
                    </div>
                    {s.feedback && (
                      <div className="mt-2 flex gap-2 rounded-xl sf-2 p-2.5">
                        <MessageCircle size={14} className="mt-0.5 shrink-0 text-alfa" />
                        <div className="text-xs text-ink-soft">
                          <b className="text-ink">Комментарий тренера:</b> {s.feedback}
                        </div>
                      </div>
                    )}
                    {s.feedbackFile && (
                      <FeedbackFileDownload filePath={s.feedbackFile} fileName={s.feedbackFileName ?? null} />
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
