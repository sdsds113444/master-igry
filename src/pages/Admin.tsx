import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, RefreshCw, Check, Trophy, Loader2, MessageCircle, Bug, HelpCircle, Lightbulb, Eye, CheckCheck, FileText, Download, Users, Crown, Paperclip, X } from 'lucide-react'
import { type Game } from '../data/mock'
import {
  listAllTeamsAdmin, getScoresForGame, gradeMany, getGames, publishGame, pickCurrentGame,
  getAnswersForGame, getAnswerFileUrl, uploadFeedbackFile, listMentorLatestFromTeams, getMentorSeen, markMentorSeen,
  getRoster, listFeedback, setFeedbackStatus, type AdminTeamRow, type FeedbackRow, type RosterMember, type GradeRow,
} from '../lib/db'

import { playPing } from '../lib/ping'
import MentorChatModal from '../components/MentorChatModal'
import Dialog from '../components/Dialog'
import ErrorCard from '../components/ErrorCard'
import { teamAvatar, basename, downloadName } from '../lib/ui'
import { gradeTotal, scoreWrite, sameScoreFields } from '../lib/scoring'
import { setUnsavedWork } from '../lib/unsavedWork'

/** Строка оценивания из серверных данных. Общая для первой загрузки и фонового
 *  обновления — иначе они разъезжались в трактовке «сдала».
 *  «Сдала» определяется наличием ответа в answers, а не величиной баллов: иначе команда,
 *  сдавшая ответ и получившая 0, после перезагрузки выглядела бы «не сдала». */
function buildGrade(s: GradeRow | undefined, hasAnswer: boolean): Grade {
  const submitted = hasAnswer
    || (s ? (s.cases > 0 || s.bonus > 0 || s.superBonusVok > 0 || s.vok > 0 || !!s.feedback || !!s.feedbackFile) : false)
  return s
    ? { submitted, cases: s.cases, bonus: s.bonus > 0, vok: s.vok, superBonusVok: s.superBonusVok > 0, feedback: s.feedback, feedbackFile: s.feedbackFile, feedbackFileName: s.feedbackFileName, pendingFile: null }
    : { submitted, cases: 0, bonus: false, vok: 0, superBonusVok: false, feedback: '', feedbackFile: null, feedbackFileName: null, pendingFile: null }
}

/** Реальный ответ команды, а не пустая заготовка.
 *
 *  submitAnswer сначала апсертит строку в answers с текстом, и только потом грузит файл.
 *  Если файл зарубила корпоративная сеть, а текста не было, в базе остаётся строка с
 *  text='' и file_url=null. Считать её сдачей нельзя: команда попадала в счётчик «N сдали»,
 *  чекбокс «Сдала» становился нередактируемым (disabled={hasAnswer}), а красная точка
 *  «на проверку» не загоралась — тренер такую команду просто не догонял, хотя ответа нет. */
function isRealAnswer(a: { answer: string; filePath: string | null } | undefined): boolean {
  return !!a && (a.answer.trim().length > 0 || !!a.filePath)
}

/** Целое число из поля ввода: защита от NaN и дробей, зажим в [0, max]. */
function clampNum(raw: string, max: number): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0
}

/** Потолок поля «VOC %». Раньше стоял 100 — считали, что VOC это доля от нуля до
 *  ста. По факту метрика бывает выше сотки (например, процент выполнения плана),
 *  и ввод молча обрезался до 100. Держим одним числом: тот же предел стоит
 *  ограничением в базе (scores_vok_check), и разъехаться им нельзя. */
const VOK_MAX = 999

interface Grade {
  submitted: boolean
  cases: number
  // feedbackFile/Name — уже сохранённый файл ОС (путь в бакете + исходное имя).
  // pendingFile — только что выбранный тренером файл, ещё не загруженный: заливается
  // в saveAll и заменяет feedbackFile. Не в БД — живёт только в состоянии оценивания.
  feedbackFile?: string | null
  feedbackFileName?: string | null
  pendingFile?: File | null
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
  const [saved, setSaved] = useState(false) // последнее сохранение прошло успешно
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const [teams, setTeams] = useState<AdminTeamRow[]>([])
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  // id команд с несохранёнными правками именно этой сессии — сохраняем ТОЛЬКО их,
  // чтобы не перезаписывать чужие оценки устаревшим снимком (общая админ-учётка).
  const [dirtyTeams, setDirtyTeams] = useState<Set<string>>(new Set())
  // «Есть несохранённое» — ВЫВОДИМ из dirtyTeams, а не держим отдельным состоянием:
  // два независимых флага разъезжались, и правки, сделанные во время сохранения,
  // считались сохранёнными (экран «Баллы сохранены», а в базе их нет).
  const dirty = dirtyTeams.size > 0
  // Зеркала для фонового обновления: колбэк таймера/focus живёт со старым замыканием,
  // а ему нужно ТЕКУЩЕЕ состояние, иначе он затрёт свежий ввод тренера.
  // Зеркала обновляются СИНХРОННО в местах изменения (upd/saveAll), а не в эффекте:
  // passive-эффект React выполняет отдельной задачей уже после коммита, и колбэк .then
  // фонового обновления (микротаск) успевал прочитать устаревшее значение — то есть
  // затереть только что введённый балл. Эффекты ниже оставлены как страховка.
  const dirtyRef = useRef<Set<string>>(dirtyTeams)
  const savingRef = useRef(false)
  const saveGenRef = useRef(0)          // растёт после каждого успешного сохранения
  // Зеркало самих оценок. saveAll — обычная функция компонента, её `grades` это снимок
  // рендера, в котором создан onClick. Между стартом сохранения и записью есть await'ы
  // (заливка файлов ОС, на банковской сети — десятки секунд), и правка, сделанная в это
  // окно, уходила в никуда: в базу писался устаревший балл, а команда снималась с
  // «несохранённых». Кнопка говорила «Баллы сохранены», через минуту фоновое обновление
  // возвращало на экран старое значение.
  const gradesRef = useRef<Record<string, Grade>>(grades)
  useEffect(() => { gradesRef.current = grades }, [grades])
  useEffect(() => { dirtyRef.current = dirtyTeams }, [dirtyTeams])
  useEffect(() => { savingRef.current = saving }, [saving])
  const [chatTeam, setChatTeam] = useState<AdminTeamRow | null>(null)
  // Ответы команд по выбранной игре (текст + путь к файлу) — источник «сдал/не сдал» и просмотра.
  const [answers, setAnswers] = useState<Record<string, { answer: string; filePath: string | null; fileName: string | null }>>({})
  // Команды, по которым УЖЕ есть строка оценки (= проверены). Красная точка «сдали, но не
  // проверено» горит у тех, кто прислал реальный ответ, но кого тут ещё нет. Гаснет при сохранении.
  const [reviewedTeams, setReviewedTeams] = useState<Set<string>>(new Set())
  // Зеркала для проверки «пришёл пустой снимок, а на экране было не пусто» (см. refresh).
  const answersRef = useRef(answers)
  const reviewedRef = useRef(reviewedTeams)
  useEffect(() => { answersRef.current = answers }, [answers])
  useEffect(() => { reviewedRef.current = reviewedTeams }, [reviewedTeams])
  const [viewTeam, setViewTeam] = useState<AdminTeamRow | null>(null)
  const [rosterTeam, setRosterTeam] = useState<AdminTeamRow | null>(null) // «провалиться» и посмотреть состав
  // «Пипочка»: по каждой команде — время последнего сообщения от неё в чате с тренером.
  const [mentorLatest, setMentorLatest] = useState<Record<string, number>>({})
  const [seenTick, setSeenTick] = useState(0) // форс-пересчёт непрочитанного после «прочитано»
  // Снимок «время последнего сообщения по каждой команде» с прошлой проверки — источник
  // звука: пингуем на КАЖДОЕ новое сообщение, а не на прирост числа команд с непрочитанным
  // (иначе второе сообщение той же команды звучало бы тишиной).
  const prevMentorLatest = useRef<Record<string, number> | null>(null)
  const openChatTeamId = useRef<string | null>(null) // чей чат открыт — по нему не пингуем

  // Список игр (+ игра по умолчанию) и список команд грузим ОДИН раз: команды от
  // выбранной игры не зависят, ни к чему перезапрашивать их при каждом переключении.
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [gs, ts] = await Promise.all([getGames(), listAllTeamsAdmin()])
        if (cancelled) return
        // Пустой ответ БЕЗ ошибки на живой базе значит «не смогли прочитать», а не
        // «данных нет»: при протухшей сессии is_admin() становится false и RLS молча
        // отдаёт 0 строк. Раньше это оставляло панель в вечном спиннере без объяснения —
        // второй эффект выходил по guard'у ДО setLoading(false).
        if (gs.length === 0 || ts.length === 0) { setLoadError(true); setLoading(false); return }
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
    // ВАЖНО: тут НЕЛЬЗЯ снимать loading. Эффекты выполняются ПОСЛЕ рендера, поэтому
    // setLoading(false) здесь открывал окно, в котором teams уже загружены, а grades ещё
    // пустые — таблица успевала отрисоваться и падала на gradeTotal(undefined).
    // Вечный спиннер, ради которого это делалось, лечится в ПЕРВОМ эффекте: пустой ответ
    // там теперь трактуется как ошибка чтения, поэтому «команд нет и загрузка молчит»
    // больше не наступает.
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
        // Полностью пустой снимок бывает по двум причинам: по игре реально ещё никто не
        // сдавал (норма для только что опубликованной) ИЛИ умерла admin-сессия и RLS молча
        // отдаёт 0 строк. Различаем по списку команд: он от игры НЕ зависит, поэтому пустой
        // ответ по нему означает именно потерю прав. Без этой проверки переключение игры на
        // протухшем токене рисовало «29 команд не сдали, 0 очков» — и по такому экрану
        // тренер начинал переоценивать работы руками.
        if (Object.keys(scores).length === 0 && Object.keys(ans).length === 0) {
          const check = await listAllTeamsAdmin().catch(() => [])
          if (cancelled) return
          if (check.length === 0) { setLoadError(true); return }
        }
        const init: Record<string, Grade> = {}
        for (const t of teams) init[t.id] = buildGrade(scores[t.id], isRealAnswer(ans[t.id]))
        setGrades(init)
        setAnswers(ans)
        setReviewedTeams(new Set(Object.keys(scores))) // у кого уже есть оценка — уже проверены
        setPublished(false)
        setSaved(false)
        setDirtyTeams(new Set()) // dirty выводится отсюда
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [gameId, teams])

  // Фоновое обновление ответов и оценок: раз в минуту и при возврате на вкладку.
  // Без него тренер, оставивший админку открытой на неделю, весь день видел «0 сдали»,
  // серые иконки ответов и мог скачать УСТАРЕВШИЙ файл команды, которая перезалила его.
  // Строки команд с несохранёнными правками НЕ трогаем — иначе затёрли бы ввод тренера.
  useEffect(() => {
    if (!gameId || teams.length === 0) return
    let stopped = false
    let lastRunAt = 0
    async function refresh() {
      // Во время сохранения не лезем: saveAll сам разложит свежее состояние.
      if (savingRef.current) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      // Троттлинг: слушателей focus теперь два (этот и опрос сообщений), а getAnswersForGame
      // тянет полные тексты ответов всех команд — без него каждое переключение окна
      // означало бы лишний тяжёлый запрос к бесплатному тарифу Supabase.
      const now = Date.now()
      if (now - lastRunAt < 15000) return
      lastRunAt = now
      // Поколение сохранений на момент старта запроса: если пока мы ходили в сеть, тренер
      // успел сохранить, наш снимок УЖЕ устарел и накрывать им свежие баллы нельзя
      // (dirtyRef тут не спасает — saveAll как раз очистил его для сохранённых команд).
      const genAtStart = saveGenRef.current
      try {
        const [scores, ans] = await Promise.all([getScoresForGame(gameId), getAnswersForGame(gameId)])
        if (stopped || savingRef.current || saveGenRef.current !== genAtStart) return
        // Пустой ответ без ошибки = скорее всего пересоздалась анонимная сессия и RLS
        // молча отдала 0 строк (is_admin() стал false). Принять это за правду значит
        // обнулить всю таблицу оценивания на экране. Пропускаем такой снимок.
        if (Object.keys(scores).length === 0 && Object.keys(ans).length === 0
            && (Object.keys(answersRef.current).length > 0 || reviewedRef.current.size > 0)) return
        setAnswers(ans)
        setReviewedTeams(new Set(Object.keys(scores)))
        setGrades((prev) => {
          const next = { ...prev }
          for (const t of teams) {
            if (dirtyRef.current.has(t.id)) continue // несохранённый ввод тренера важнее снимка
            next[t.id] = buildGrade(scores[t.id], isRealAnswer(ans[t.id]))
          }
          return next
        })
      } catch { /* тихо: это фоновое обновление, экран уже что-то показывает */ }
    }
    const timer = window.setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [gameId, teams])

  // Опрос непрочитанных сообщений от команд: раз в 45с (не критична секундная
  // свежесть, важно не грузить бесплатный тариф Supabase лишними запросами при
  // нескольких одновременных тестерах) + при возврате на вкладку. Звук — когда
  // появилось НОВОЕ непрочитанное.
  useEffect(() => {
    let stopped = false
    async function check() {
      // Гейта по visibilityState здесь НЕТ намеренно: смысл звукового уведомления —
      // сработать, когда тренер смотрит в другое окно. Раньше опрос в фоновой вкладке не
      // шёл вообще, и звук раздавался только когда тренер сам возвращался на вкладку.
      try {
        const latest = await listMentorLatestFromTeams()
        if (stopped) return
        setMentorLatest(latest)
        // Чат этой команды открыт И вкладка на экране — значит сообщение реально читают:
        // помечаем прочитанным, иначе точка со звуком загорались бы снова на то, что
        // тренер уже видел. Проверка видимости обязательна: сам опрос намеренно работает
        // и в фоновой вкладке (ради звука), а вот «прочитано» в свёрнутом окне — ложь,
        // там сообщение даже не отрисовано (фолбэк-опрос чата в фоне не тянет историю).
        const openId = openChatTeamId.current
        const visible = typeof document === 'undefined' || document.visibilityState === 'visible'
        if (openId && visible && latest[openId]) {
          markMentorSeen(openId, latest[openId])
          setSeenTick((n) => n + 1)
        }
        const prev = prevMentorLatest.current
        if (prev !== null) {
          const hasNew = Object.keys(latest).some((tid) =>
            latest[tid] > (prev[tid] ?? 0)          // пришло после прошлой проверки
            && latest[tid] > getMentorSeen(tid)      // и это непрочитанное
            && tid !== openChatTeamId.current)       // и не тот чат, что открыт прямо сейчас
          if (hasNew) playPing()
        }
        prevMentorLatest.current = latest
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
    openChatTeamId.current = t.id
    setChatTeam(t)
    // Карта непрочитанных обновляется раз в 45 с, поэтому на момент открытия она может
    // отставать: сообщение, пришедшее после последнего опроса, осталось бы «непрочитанным»,
    // и точка загоралась бы снова сразу после закрытия чата. Догоняем свежим снимком.
    listMentorLatestFromTeams()
      .then((fresh) => {
        setMentorLatest(fresh)
        const ts = fresh[t.id]
        if (ts && openChatTeamId.current === t.id) {
          markMentorSeen(t.id, ts)
          setSeenTick((n) => n + 1)
        }
      })
      .catch(() => { /* не критично: догонит следующий опрос */ })
  }, [mentorLatest])

  // Красная точка «сдали, но не проверено»: реальный ответ (текст/файл) есть, а строки
  // оценки по команде ещё нет. Пустая заготовка в answers (без текста и файла) точку НЕ даёт.
  const pendingReview = useMemo(() => {
    const s = new Set<string>()
    for (const tid of Object.keys(answers)) {
      if (isRealAnswer(answers[tid]) && !reviewedTeams.has(tid)) s.add(tid)
    }
    return s
  }, [answers, reviewedTeams])

  // Страховка от «строка есть, оценки ещё нет». Эффекты идут после рендера, поэтому между
  // появлением команд и построением grades существует кадр, где grades[t.id] === undefined,
  // а GradeRowDesktop зовёт gradeTotal(g) и падает на чтении g.submitted — именно так
  // админка легла в проде 01.08.2026. Пока строки не готовы, показываем спиннер: это
  // не может залипнуть навсегда, потому что эффект либо заполнит grades, либо выставит
  // loadError (и тогда покажется карточка ошибки, а не таблица).
  const gradesReady = teams.every((t) => grades[t.id] !== undefined)

  const submittedCount = Object.values(grades).filter((g) => g.submitted).length
  const gameStatus = games.find((g) => g.id === gameId)?.status
  const isPublished = gameStatus === 'current'
  // Уже сыгранная игра публикуется ПОВТОРНО одним кликом: она снова становится текущей,
  // а нынешняя неделя схлопывается в done. Дедлайн при этом не пересчитывается (в
  // publish_game он ставится только если пуст), то есть у вернувшейся игры он в прошлом —
  // приём закрыт сразу у обеих. Для done кнопка показывала «Выложить задание», потому что
  // isPublished там false. Публиковать разрешаем только ещё не сыгранные игры.
  const isReplayed = gameStatus === 'done'

  // Стабильная ссылка (useCallback + функциональные setState без внешних зависимостей):
  // нужна, чтобы мемоизированные строки/карточки команд не ре-рендерились все разом
  // на каждый ввод символа — перерисовывается только та команда, чей grade изменился.
  const upd = useCallback((id: string, patch: Partial<Grade>) => {
    // Зеркало ведём синхронно и делаем его источником правды для saveAll: passive-эффект
    // отработает уже после коммита, а сохранение может стартовать раньше.
    gradesRef.current = { ...gradesRef.current, [id]: { ...gradesRef.current[id], ...patch } }
    setGrades(gradesRef.current)
    setDirtyTeams((s) => { const n = new Set(s); n.add(id); return n }) // помечаем команду изменённой
    // Синхронно, ДО коммита React: фоновое обновление может прочитать ref раньше, чем
    // отработает passive-эффект, и затереть только что введённое значение.
    dirtyRef.current = new Set(dirtyRef.current).add(id)
    setSaved(false)
  }, [])

  // Пока есть несохранённые баллы — предупреждаем при обновлении/закрытии вкладки
  // (главный вектор случайной потери: оценивание — самая трудоёмкая операция).
  // Смену игры внутри страницы уже страхует changeGame() ниже.
  //
  // beforeunload не ловит навигацию ВНУТРИ SPA, а кнопка «Выйти» в шапке — именно она:
  // signOut() + navigate('/'), Admin размонтируется вместе со всем введённым. Поэтому тот же
  // dirty поднимаем во внешний флаг, который читает Layout перед выходом. Cleanup снимает
  // его и при сохранении, и при уходе со страницы — «мёртвый» флаг спрашивать не заставит.
  useEffect(() => {
    if (!dirty) return
    setUnsavedWork(true)
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      setUnsavedWork(false)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
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
    savingRef.current = true // синхронно: фоновое обновление не должно влезть в этот момент
    setSaveError('')
    try {
      // КРИТИЧНО: пишем ТОЛЬКО реально изменённые в этой сессии команды, а не весь батч по
      // всем командам. Раньше saveAll слепо апсертил строки ВСЕХ команд из локального
      // снимка → при общей админ-учётке второй тренер затирал баллы первого нулями из
      // своего устаревшего снимка (тихий lost-update). Маппинг «строка оценивания → очки»
      // вынесен в scoreWrite (scoring.ts) и покрыт тестами.
      const changed = teams.filter((t) => dirtyTeams.has(t.id))
      // Снимок, который реально уйдёт в базу. Берём из зеркала (актуальное значение на
      // момент клика), а НЕ из замыкания рендера, и держим его до конца сохранения:
      // с ним же потом сверяем, не правил ли тренер эти поля, пока шли запросы.
      const sent = gradesRef.current

      // Сперва заливаем новые файлы ОС (по одному). Если хоть один не загрузился —
      // ПРЕРЫВАЕМ всё сохранение и просим повторить: иначе баллы сохранились бы без
      // обещанного разбора, а файл потерялся бы молча. Команды без нового файла берут
      // ранее сохранённый путь (round-trip через grade state, апсерт его не теряет).
      const resolved: Record<string, { feedbackFile: string | null; feedbackFileName: string | null }> = {}
      for (const t of changed) {
        const g = sent[t.id]
        if (g.submitted && g.pendingFile) {
          const up = await uploadFeedbackFile(t.id, gameId, g.pendingFile)
          if (!up.ok) {
            // Показываем НАСТОЯЩУЮ причину: «попробуйте ещё раз» ничего не давало —
            // тренер не знал, дело в размере файла, в правах или в корпоративной сети.
            setSaveError(`Файл обратной связи для «${t.name}» не загрузился — ${up.reason}. Баллы не сохранены: уберите файл или повторите.`)
            return
          }
          resolved[t.id] = { feedbackFile: up.path, feedbackFileName: up.name }
        } else {
          resolved[t.id] = { feedbackFile: g.feedbackFile ?? null, feedbackFileName: g.feedbackFileName ?? null }
        }
      }

      const toWrite = (t: AdminTeamRow) => {
        const g = sent[t.id]
        return scoreWrite({
          submitted: g.submitted, cases: g.cases, bonus: g.bonus, vok: g.vok,
          superBonusVok: g.superBonusVok, feedback: g.feedback, ...resolved[t.id],
        })
      }

      if (changed.length > 0) {
        await gradeMany(changed.map((t) => ({ teamId: t.id, gameId, ...toWrite(t) })))
      }

      // Залитый файл теперь «сохранённый»: снимаем pendingFile и подставляем итоговый путь
      // (scoreWrite мог обнулить его, если команду сняли со «сдала») — иначе повторное
      // сохранение перезалило бы тот же файл, а UI показывал бы «есть несохранённый».
      // Команды, которые тренер успел поправить ПОКА шло сохранение: в базу ушло старое
      // значение, поэтому «несохранено» с них снимать нельзя — иначе правка исчезнет молча.
      const editedDuringSave = new Set(
        changed.filter((t) => !sameScoreFields(sent[t.id], gradesRef.current[t.id])).map((t) => t.id),
      )
      setGrades((prev) => {
        const next = { ...prev }
        for (const t of changed) {
          if (editedDuringSave.has(t.id)) continue // не трогаем то, что тренер правит прямо сейчас
          const w = toWrite(t)
          next[t.id] = { ...prev[t.id], feedbackFile: w.feedbackFile, feedbackFileName: w.feedbackFileName, pendingFile: null }
        }
        gradesRef.current = next
        return next
      })

      // Сохранённые команды теперь проверены — гасим у них красную точку «на проверку».
      setReviewedTeams((prev) => { const n = new Set(prev); changed.forEach((t) => n.add(t.id)); return n })
      // Снимаем «несохранённое» ТОЧЕЧНО — только с тех команд, что реально ушли в этом
      // сохранении. Раньше множество обнулялось целиком, и правки, сделанные ПОКА шёл
      // запрос, считались сохранёнными: экран показывал «Баллы сохранены», а баллы
      // оставались только на экране до перезагрузки.
      setDirtyTeams((prev) => {
        const n = new Set(prev)
        changed.forEach((t) => { if (!editedDuringSave.has(t.id)) n.delete(t.id) })
        return n
      })
      // Синхронно, чтобы фоновое обновление сразу видело актуальный набор «грязных».
      const nextDirty = new Set(dirtyRef.current)
      changed.forEach((t) => { if (!editedDuringSave.has(t.id)) nextDirty.delete(t.id) })
      dirtyRef.current = nextDirty
      // Честный итог: «сохранено» только если сохранили всё, что просили. Если тренер
      // правил во время записи, кнопка обязана остаться активной, а не гаснуть.
      if (editedDuringSave.size > 0) {
        setSaveError('Пока шло сохранение, вы поправили баллы — они ещё не записаны. Нажмите «Сохранить» ещё раз.')
      } else {
        setSaved(true)
      }
      // Снимок, улетевший ДО этого сохранения, теперь устарел — фоновое обновление
      // отбросит его по несовпадению поколения, а не накроет им свежие баллы.
      saveGenRef.current += 1
    } catch {
      setSaveError('Не удалось сохранить баллы. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSaving(false)
      savingRef.current = false
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
      // Исключение НЕ значит, что публикация не прошла: RPC могла дойти до Postgres и
      // закоммититься, а ответ потеряться на банковской сети или на таймауте прокси.
      // publish_game не идемпотентна — она безусловно вставляет две записи в ленту, и
      // повторный клик задваивал бы их у всех команд. Поэтому сначала перечитываем факт.
      const fresh = await getGames().catch(() => null)
      if (fresh && fresh.find((x) => x.id === gameId)?.status === 'current') {
        setGames(fresh)
        setPublished(true)
        setPublishing(false)
        return
      }
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
            disabled={publishing || !gameId || published || isPublished || isReplayed}
            title={isReplayed ? 'Эта игра уже сыграна. Повторная публикация закрыла бы текущую неделю.' : undefined}
            className="btn-alfa ml-auto flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {publishing
              ? <><Loader2 size={16} className="animate-spin" /> Публикую…</>
              : (published || isPublished)
                ? <><Check size={16} /> Опубликовано на доске</>
                : isReplayed
                  ? <><Check size={16} /> Игра уже сыграна</>
                  : <><Megaphone size={16} /> Выложить задание</>}
          </button>
        </div>
      </div>

      {/* Таблица оценивания */}
      <div className="glass-strong overflow-hidden rounded-glass">
        <div className="flex flex-col gap-1.5 border-b border-black/5 px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
          <h2 className="font-display text-xl font-bold">Оценивание команд</h2>
          <div className="text-xs font-semibold text-ink-soft">
            {/* Раньше было «&gt;3» и «&lt;3» — ровно 3 ошибки не попадали никуда, и тренер
                вручную ставил 1 там, где проверка ставит 2. Границы сведены встык. */}
            Оценка за кейсы (общая, 0–3): 0 — не сдали · 1 — 4 и более ошибок · 2 — 1–3 ошибки · 3 — без ошибок
          </div>
        </div>

        {loading || !gradesReady ? (
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
                    hasAnswer={isRealAnswer(answers[t.id])}
                    needsReview={pendingReview.has(t.id)}
                    unread={mentorUnread.has(t.id)}
                    saving={saving}
                    alreadyGraded={reviewedTeams.has(t.id)}
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
                hasAnswer={isRealAnswer(answers[t.id])}
                needsReview={pendingReview.has(t.id)}
                unread={mentorUnread.has(t.id)}
                saving={saving}
                alreadyGraded={reviewedTeams.has(t.id)}
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
            {/* «Баллы сохранены» — только когда несохранённого не осталось: если во время
                запроса тренер успел что-то ещё изменить, кнопка снова зовёт сохранить. */}
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved && !dirty ? <><Check size={16} /> Баллы сохранены</> : <><RefreshCw size={16} /> Сохранить и обновить рейтинг</>}
          </motion.button>
        </div>
      </div>

      <MentorChatModal
        open={!!chatTeam}
        onClose={() => {
          if (chatTeam) { markMentorSeen(chatTeam.id, mentorLatest[chatTeam.id] ?? Date.now()); setSeenTick((n) => n + 1) }
          openChatTeamId.current = null
          setChatTeam(null)
        }}
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
  data?: { answer: string; filePath: string | null; fileName: string | null }
  onClose: () => void
}) {
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  // Исходное имя, как его дала команда (ключ в Storage транслитерирован); для файлов,
  // сданных до появления колонки file_name, — имя из пути.
  const fileName = data?.fileName ?? (data?.filePath ? basename(data.filePath) : null)

  // Сбрасываем ошибку И флаг загрузки при смене команды: AnswerView остаётся смонтированным
  // между открытиями (условен только Dialog внутри). Без сброса downloading зависшее скачивание
  // одной команды оставляло кнопку «Скачать» серой у ВСЕХ остальных до перезагрузки страницы.
  useEffect(() => { setDownloadError(''); setDownloading(false) }, [team])

  async function download() {
    if (!data?.filePath || downloading) return
    setDownloading(true)
    setDownloadError('')
    try {
      const url = await getAnswerFileUrl(data.filePath)
      if (!url) { setDownloadError('Не удалось получить ссылку на файл. Попробуйте ещё раз.'); return }
      // Скачиваем через blob, а НЕ window.open: открытие окна после await теряет «жест
      // пользователя» и режется блокировщиком всплывающих окон (особенно Яндекс.Браузер) —
      // тренер жмёт «Скачать», и ничего не происходит. Плюс download-атрибут для кросс-
      // доменной ссылки не работает — поэтому тянем файл и отдаём как локальный blob.
      const res = await fetch(url)
      if (!res.ok) throw new Error(`http ${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      // Имя команды в начале имени файла: путь в бакете (teamId/gameId/...) при скачивании
      // отбрасывается, и все команды присылают ОДИН И ТОТ ЖЕ шаблон кейсов — в «Загрузках»
      // получалось cases-noforward.xlsx, (1), (2)… без признака владельца, и легко было
      // выставить баллы не той команде.
      a.download = downloadName(team?.name, fileName)
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(objUrl), 10000)
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

/** Потолок размера файла ОС от тренера — тот же, что у файла-ответа команды: запасной
 *  канал /sb (прокси Vercel) обрывает запросы длиннее 120 с, тяжёлый файл не успеет. */
const FEEDBACK_FILE_MAX = 15 * 1024 * 1024

/** Прикрепление файла обратной связи тренером (разбор кейсов) — рядом с комментарием.
 *  Показывает имя выбранного/сохранённого файла, позволяет заменить и убрать. Сам файл
 *  заливается не тут, а в saveAll: тут только выбор (pendingFile) — чтобы загрузка шла
 *  по кнопке «Сохранить», а не на каждый клик, и попадала в общий поток ошибок.
 *  busy=true (идёт сохранение) блокирует правки: иначе файл, выбранный во время
 *  сохранения, был бы затёрт финальным setGrades. */
function FeedbackFileControl({ g, onChange, busy }: { g: Grade; onChange: (patch: Partial<Grade>) => void; busy: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sizeError, setSizeError] = useState('')
  const isPending = !!g.pendingFile
  const name = g.pendingFile?.name ?? g.feedbackFileName ?? null
  const disabled = !g.submitted || busy
  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = '' // сброс: позволяет выбрать тот же файл повторно (после «убрать»)
    if (!f) return
    if (f.size > FEEDBACK_FILE_MAX) { setSizeError('Файл больше 15 МБ — сожмите его и прикрепите снова.'); return }
    setSizeError('')
    onChange({ pendingFile: f })
  }
  return (
    <div className="mt-1">
      <input ref={inputRef} type="file" className="hidden" aria-hidden="true" tabIndex={-1} onChange={pick} />
      {name ? (
        <div className="flex items-center gap-1 text-[11px]">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            title={isPending ? 'Файл выбран, сохранится по кнопке «Сохранить». Нажмите, чтобы заменить.' : 'Заменить файл'}
            className="flex min-w-0 items-center gap-1 text-ink-soft transition-colors hover:text-alfa disabled:opacity-40"
          >
            <Paperclip size={11} className={isPending ? 'shrink-0 text-alfa' : 'shrink-0'} />
            <span className="max-w-[130px] truncate font-semibold">{name}</span>
          </button>
          {isPending && <span className="shrink-0 font-bold text-alfa" title="Не сохранён" aria-hidden="true">•</span>}
          {isPending && <span className="sr-only">— не сохранён</span>}
          <button
            type="button"
            onClick={() => { setSizeError(''); onChange(isPending ? { pendingFile: null } : { feedbackFile: null, feedbackFileName: null }) }}
            disabled={busy}
            aria-label="Убрать файл"
            title="Убрать файл"
            className="shrink-0 text-ink-soft transition-colors hover:text-alfa disabled:opacity-40"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex items-center gap-1 text-[11px] font-semibold text-ink-soft transition-colors hover:text-alfa disabled:opacity-40"
        >
          <Paperclip size={11} /> Прикрепить файл
        </button>
      )}
      {sizeError && <p className="mt-0.5 text-[11px] font-semibold text-danger" role="alert">{sizeError}</p>}
    </div>
  )
}

/** Строка таблицы оценивания (desktop), мемоизированная: перерисовывается только та
 *  команда, чей grade изменился, а не все ~30 строк на каждый ввод символа. Опирается
 *  на СТАБИЛЬНЫЕ пропсы onUpd/onChat/onView (см. useCallback/setState в Admin). */
const GradeRowDesktop = memo(function GradeRowDesktop({
  t, g, hasAnswer, needsReview, unread, saving, alreadyGraded, onUpd, onChat, onView, onRoster,
}: {
  t: AdminTeamRow
  g: Grade
  hasAnswer: boolean
  needsReview: boolean
  unread: boolean
  saving: boolean
  /** У команды уже есть СОХРАНЁННАЯ оценка (строка в scores). Снятие «сдала» её обнулит. */
  alreadyGraded: boolean
  onUpd: (id: string, patch: Partial<Grade>) => void
  onChat: (t: AdminTeamRow) => void
  onView: (t: AdminTeamRow) => void
  onRoster: (t: AdminTeamRow) => void
}) {
  const sum = gradeTotal(g)
  const onChange = (patch: Partial<Grade>) => onUpd(t.id, patch)
  // Снятие «сдала» обнуляет ВСЮ строку (баллы, VOC, комментарий, файл разбора) — см.
  // scoreWrite. Для уже оценённой команды спрашиваем подтверждение: случайное касание
  // чекбокса стирало неделю без следа, а прежних значений нигде не остаётся.
  const onToggleSubmitted = (next: boolean) => {
    if (!next && alreadyGraded && !window.confirm(
      `Снять отметку «сдала» у команды «${t.name}»?\n\nПри сохранении обнулятся баллы, VOC, комментарий и файл разбора за эту неделю. Отменить это будет нельзя.`
    )) return
    onChange({ submitted: next })
  }
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
            aria-label={needsReview ? `Ответ команды ${t.name} — не проверен` : `Ответ команды ${t.name}`}
            title={hasAnswer ? (needsReview ? 'Сдали — не проверено' : 'Посмотреть ответ команды') : 'Команда ещё не сдала ответ'}
            className="tap relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa disabled:opacity-30"
          >
            <FileText size={16} />
            {needsReview && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-alfa ring-2 ring-white" />}
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
          onChange={(e) => onToggleSubmitted(e.target.checked)}
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
          type="number" min={0} max={VOK_MAX}
          value={g.vok}
          disabled={!g.submitted}
          title="Индекс качества обслуживания (VOC). На «Итог» напрямую не влияет — учитывается через галочку «Супер +3 VOC»."
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange({ vok: clampNum(e.target.value, VOK_MAX) })}
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
        <FeedbackFileControl g={g} onChange={onChange} busy={saving} />
      </td>
      <td className="px-4 text-right text-base font-bold">{sum}</td>
    </tr>
  )
})

/** Карточка оценивания одной команды для мобильной раскладки (замена строки таблицы). */
const GradeCard = memo(function GradeCard({
  t, g, hasAnswer, needsReview, unread, saving, alreadyGraded, onUpd, onChat, onView, onRoster,
}: {
  t: AdminTeamRow
  g: Grade
  hasAnswer: boolean
  needsReview: boolean
  unread: boolean
  saving: boolean
  /** У команды уже есть СОХРАНЁННАЯ оценка (строка в scores). Снятие «сдала» её обнулит. */
  alreadyGraded: boolean
  onUpd: (id: string, patch: Partial<Grade>) => void
  onChat: (t: AdminTeamRow) => void
  onView: (t: AdminTeamRow) => void
  onRoster: (t: AdminTeamRow) => void
}) {
  const sum = gradeTotal(g)
  const onChange = (patch: Partial<Grade>) => onUpd(t.id, patch)
  // Снятие «сдала» обнуляет ВСЮ строку (баллы, VOC, комментарий, файл разбора) — см.
  // scoreWrite. Для уже оценённой команды спрашиваем подтверждение: случайное касание
  // чекбокса стирало неделю без следа, а прежних значений нигде не остаётся.
  const onToggleSubmitted = (next: boolean) => {
    if (!next && alreadyGraded && !window.confirm(
      `Снять отметку «сдала» у команды «${t.name}»?\n\nПри сохранении обнулятся баллы, VOC, комментарий и файл разбора за эту неделю. Отменить это будет нельзя.`
    )) return
    onChange({ submitted: next })
  }
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
          aria-label={needsReview ? `Ответ команды ${t.name} — не проверен` : `Ответ команды ${t.name}`}
          title={hasAnswer ? (needsReview ? 'Сдали — не проверено' : 'Посмотреть ответ команды') : 'Команда ещё не сдала ответ'}
          className="tap relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa disabled:opacity-30"
        >
          <FileText size={16} />
          {needsReview && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-alfa ring-2 ring-white" />}
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
          onChange={(e) => onToggleSubmitted(e.target.checked)}
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
            type="number" min={0} max={VOK_MAX}
            value={g.vok}
            disabled={!g.submitted}
            title="Индекс качества обслуживания (VOC). На «Итог» напрямую не влияет — учитывается через галочку «Супер +3 VOC»."
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onChange({ vok: clampNum(e.target.value, VOK_MAX) })}
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

      <div className="mt-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">ОС тренера</span>
          <input
            value={g.feedback}
            disabled={!g.submitted}
            onChange={(e) => onChange({ feedback: e.target.value })}
            placeholder="комментарий команде…"
            className="w-full rounded-lg border border-black/10 sf-3 px-3 py-2 text-sm outline-none focus:border-alfa/50 disabled:opacity-40"
          />
        </label>
        {/* Вне <label>: у файл-контрола свои кнопки и input — вложение интерактива в
            label невалидно и портит доступное имя поля комментария. */}
        <FeedbackFileControl g={g} onChange={onChange} busy={saving} />
      </div>
    </div>
  )
})
