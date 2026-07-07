import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Trophy, Flame, Lock, Check, Play, ArrowRight, Clapperboard, Newspaper } from 'lucide-react'
import { GAME_VIDEO, START_VIDEO, type Game } from '../data/mock'
import {
  getSession, listTeamsRating, getGames, listFeed, pickCurrentGame,
  type RatingRow, type FeedRow,
} from '../lib/db'
import { rankTier, rankPercent, fadeUp, teamAvatar } from '../lib/ui'
import VideoModal from '../components/VideoModal'
import Badge from '../components/Badge'
import Tilt from '../components/Tilt'
import Confetti from '../components/Confetti'
import CountUp from '../components/CountUp'
import ErrorCard from '../components/ErrorCard'
import Icon3D, { EMOJI_ICON_3D, FEED_ICON_3D, GAME_ICON_3D, type Icon3DName } from '../components/Icon3D'

// Тематические образы КОЯ по играм — кадры выдернуты прямо из мультиков этих игр
// (video/МУЛЬТ 5/7/8.mp4 через ffmpeg). Нет образа → градиент+эмодзи.
const GAME_IMAGE: Record<string, string> = {
  detective: '/koya/game-detective.webp',
  noforward: '/koya/game-noforward.webp',
  iknow: '/koya/game-iknow.webp',
  onecall: '/koya/game-onecall.webp',
  empathy: '/koya/game-empathy.webp', // КОЯ держит светящееся сердце у груди
  captains: '/koya/game-captains.webp', // КОЯ в блестящем пиджаке с микрофоном на сцене
  marathon: '/koya/game-marathon.webp', // КОЯ с финишным флагом — финал сезона
}

// Позиция кадра в баннере — под каждую композицию своя (персонаж не всегда по центру).
const GAME_IMAGE_POSITION: Record<string, string> = {
  empathy: 'center 28%', // КОЯ держит светящееся сердце у груди
  captains: 'center 22%', // КОЯ в блестящем пиджаке с микрофоном
  marathon: 'center 30%', // КОЯ с финишным флагом и конфетти
}

const DROP_ICONS: Icon3DName[] = [
  'star',
  'trophy',
  'star',
  'trophy',
  'star',
  'trophy',
]

export default function Board() {
  const [rating, setRating] = useState<RatingRow[] | null>(null)
  // Нужен только id своей команды (для подсветки строки и карточки героя) — берём его
  // из локальной сессии, а не отдельным запросом getMyTeam(): все данные уже в rating.
  const myTeamId = getSession()?.teamId ?? null
  const [games, setGames] = useState<Game[] | null>(null)
  const [feed, setFeed] = useState<FeedRow[] | null>(null)
  const [video, setVideo] = useState<{ title: string; src: string } | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [r, gs, fd] = await Promise.all([
          listTeamsRating(), getGames(), listFeed(),
        ])
        if (cancelled) return
        setRating(r); setGames(gs); setFeed(fd)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Тихо обновляем рейтинг/игры/ленту: при возврате на вкладку и по таймеру раз в 4 минуты —
  // чтобы уже открытая доска подхватывала новые баллы после сохранения в админке без перезагрузки.
  useEffect(() => {
    let refreshing = false // focus и visibilitychange на возврате вкладки летят почти
                           // одновременно — не запускаем два параллельных обновления.
    async function refresh() {
      if (document.visibilityState !== 'visible' || refreshing) return
      refreshing = true
      try {
        const [r, gs, fd] = await Promise.all([listTeamsRating(), getGames(), listFeed()])
        setRating(r); setGames(gs); setFeed(fd)
        setError(false) // сеть восстановилась — гасим экран ошибки первичной загрузки
      } catch {
        /* тихо: это фоновое обновление, не первичная загрузка */
      } finally {
        refreshing = false
      }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 4 * 60 * 1000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [])

  const myRating = rating?.find((r) => r.id === myTeamId)
  const myRank = myRating?.rank ?? 1
  const inPrizes = !!myRating && myRating.rank <= 3 // призовая тройка → залп конфетти

  if (error) {
    return <ErrorCard title="Не удалось загрузить доску" />
  }

  if (!rating || !games || !feed) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">Загружаем доску…</span>
        <div className="skeleton h-64 rounded-glass border border-white/60" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-44 min-w-[210px] flex-1 rounded-3xl border border-white/60" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-3xl border border-white/60" />
            ))}
          </div>
          <div className="skeleton h-72 rounded-3xl border border-white/60" />
        </div>
      </div>
    )
  }

  const doneCount = games.filter((g) => g.status === 'done').length
  // Пустой список игр (БД не настроена) — не роняем страницу обращением к .week/.id.
  if (games.length === 0) {
    return <ErrorCard title="Игры сезона ещё не настроены" hint="Загляните позже — задания скоро появятся." />
  }
  const activeGame = pickCurrentGame(games) // опубликованная игра недели или null (до старта)
  // Сезон стартовал, только если админ уже опубликовал хотя бы одну игру. До старта
  // (все игры locked) шапка не утверждает «сейчас идёт игра».
  const seasonStarted = games.some((g) => g.status === 'current' || g.status === 'done')
  // Опорная игра для ссылок (неделя в шапке, фолбэк ленты), когда активной ещё нет.
  const refGame = activeGame ?? games.find((g) => g.status === 'done') ?? games[0]

  return (
    <div className="space-y-6">
      <VideoModal
        open={video !== null}
        onClose={() => setVideo(null)}
        title={video?.title ?? ''}
        src={video?.src ?? ''}
      />
      {/* ==== ГЕРОЙ-БАННЕР ==== */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass-strong relative overflow-hidden rounded-glass"
      >
        {/* Залп конфетти по всему баннеру — один раз, когда моя команда в призовой тройке */}
        {inPrizes && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <Confetti count={48} />
          </div>
        )}
        <div className="grid md:grid-cols-[1.25fr_1fr]">
          {/* Текст */}
          <div className="relative z-10 p-7 sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full bg-alfa/10 px-3 py-1 text-xs font-bold text-alfa-ink">
              <Flame size={13} /> {seasonStarted ? `Сезон 1 · Неделя ${refGame.week} из 9` : 'Сезон 1 · Скоро старт'}
            </span>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.1] sm:text-4xl">
              Общая доска <span className="text-gradient">чемпионата</span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-ink-soft">
              {activeGame
                ? <>Здесь выходят мультики КОЯ, прилетают задания недели и обновляется рейтинг всех 30 команд. Сейчас идёт игра «{activeGame.title}».</>
                : <>Здесь будут выходить мультики КОЯ, прилетать задания недели и обновляться рейтинг всех 30 команд. Начните со вступительного мультика — он объясняет правила. Игры сезона откроются на старте.</>}
            </p>

            {/* Прогресс сезона — показываем, только когда сезон уже идёт */}
            {seasonStarted && (
            <div className="mt-5 max-w-md">
              <div className="mb-1.5 flex justify-between text-xs font-semibold text-ink-soft">
                <span>Прогресс сезона</span>
                <span>{doneCount} / {games.length} игр</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, var(--color-alfa-soft), var(--color-alfa))' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(doneCount / games.length) * 100}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                />
              </div>
            </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/team" className="btn-alfa flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold">
                <Play size={16} /> К заданию недели
              </Link>
              <a
                href="#rating"
                className="flex items-center gap-2 rounded-2xl sf-2 px-5 py-3 text-sm font-bold text-ink transition-colors sf-hover"
              >
                <Trophy size={16} /> Смотреть рейтинг
              </a>
              <button
                onClick={() => setVideo({ title: 'Стартовый мультик КОЯ', src: START_VIDEO })}
                className="flex items-center gap-2 rounded-2xl sf-2 px-5 py-3 text-sm font-bold text-ink transition-colors sf-hover"
              >
                <Play size={16} /> Вступление
              </button>
            </div>
          </div>

          {/* Сцена с маскотом + карточка «Рейтинг героя» — наклоняется 3D за курсором/гироскопом */}
          <Tilt className="relative min-h-[260px]">
            <div className="relative h-full min-h-[260px] overflow-hidden">
              {/* Пастельная подложка — просвечивает там, где фото угасает по маске,
                  вместо жёсткого прямоугольного среза картинки на стыке с текстовой панелью. */}
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to right, var(--color-sky), var(--color-lilac) 70%)',
                }}
              />
              <img
                src="/koya/koya-hero-crop.webp"
                alt="Маскот КОЯ"
                className="absolute inset-0 h-full w-full object-cover"
                style={{
                  objectPosition: '50% 58%',
                  // Линейное угасание по всей высоте левого края (не радиальная виньетка —
                  // та тает только по углам и оставляет шов посередине высоты).
                  maskImage: 'linear-gradient(to right, transparent 0%, black 24%)',
                  // Стандартный синтаксис и в -webkit-варианте: легаси
                  // -webkit-linear-gradient не принимает «to right» → значение было
                  // невалидным и маска отбрасывалась (жёсткий шов в старых WebView).
                  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 24%)',
                }}
              />
              {/* Крупная кнопка «Вступление» поверх маскота: стартовый мультик КОЯ
                  объясняет правила. Клик по всей сцене запускает его — чтобы на старте
                  было очевидно, куда нажать (сам маскот остаётся на месте). */}
              <button
                type="button"
                onClick={() => setVideo({ title: 'Стартовый мультик КОЯ', src: START_VIDEO })}
                aria-label="Смотреть вступительный мультик КОЯ"
                className="group absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white/85 text-alfa shadow-xl backdrop-blur transition-transform group-hover:scale-110">
                  <Play size={26} fill="currentColor" />
                </span>
                <span className="rounded-full bg-black/55 px-4 py-1.5 text-sm font-extrabold text-white shadow-lg backdrop-blur">
                  ▶ Вступление
                </span>
              </button>
              {/* падающие коечки */}
              {DROP_ICONS.map((name, i) => (
                <Icon3D
                  key={`koya-drop-${i}`}
                  name={name}
                  className="pointer-events-none absolute top-0 h-8 w-8 object-contain drop-shadow-lg"
                  style={{
                    left: `${12 + i * 14}%`,
                    animation: `koya-drop ${5 + (i % 3)}s linear ${i * 0.9}s infinite`,
                  }}
                />
              ))}
            </div>
          </Tilt>
        </div>
      </motion.section>

      {/* ==== МЕСТО В СЕЗОНЕ ==== вынесено в отдельную карточку, чтобы не перекрывать маскота */}
      {myTeamId && myRating && (() => {
        const tier = rankTier(myRank)
        const percent = rankPercent(myRank)
        return (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="glass-strong flex flex-wrap items-center gap-x-6 gap-y-3 rounded-glass px-5 py-4"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Место в сезоне</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-extrabold">#<CountUp value={myRank} /></span>
                <span className="text-sm font-bold text-ink-soft">из 30</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold" style={{ color: tier.color }}>
              <Icon3D name={EMOJI_ICON_3D[tier.emoji]} fallback={tier.emoji} className="h-7 w-7 object-contain drop-shadow-sm" />
              {tier.label}
            </div>
            <div className="ml-auto w-full sm:w-56">
              <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: tier.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                />
              </div>
            </div>
          </motion.section>
        )
      })()}

      {/* ==== ЛЕНТА ИГР СЕЗОНА ==== */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl font-bold">
          <Clapperboard size={20} className="text-alfa" /> Игры сезона
        </h2>
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {games.map((g, i) => {
            const locked = g.status === 'locked'
            return (
            <motion.button
              key={g.id}
              type="button"
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              disabled={locked}
              aria-label={locked ? `${g.title} — откроется позже` : `Смотреть мультик — ${g.title}`}
              onClick={locked ? undefined : () => {
                const src = g.video_url || GAME_VIDEO[g.id]
                if (src) setVideo({ title: 'Мультик — ' + g.title, src })
              }}
              className={`glass lift min-w-[210px] flex-1 snap-start overflow-hidden rounded-3xl text-left ${
                locked ? 'cursor-default opacity-60' : 'cursor-pointer'
              }`}
              style={g.status === 'current' ? { boxShadow: `0 0 0 2px ${g.accent}, 0 16px 40px -16px ${g.accent}` } : {}}
            >
              {/* Баннер: образ КОЯ или градиент с эмодзи */}
              <div className="relative h-24 w-full overflow-hidden">
                {GAME_IMAGE[g.id] ? (
                  <img
                    src={GAME_IMAGE[g.id]}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    // Закрытые игры: сильно замыливаем и затемняем арт, чтобы не спойлерить кадры мультика
                    className={`absolute inset-0 h-full w-full object-cover ${locked ? 'scale-125 blur-xl brightness-[0.35]' : ''}`}
                    style={{ objectPosition: GAME_IMAGE_POSITION[g.id] ?? 'center 32%' }}
                  />
                ) : (
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${g.accent}38, ${g.accent}0d)` }}
                  >
                    <span
                      className="pointer-events-none absolute -left-3 -top-5 h-16 w-16 rounded-full blur-xl"
                      style={{ background: `${g.accent}55` }}
                    />
                    <span
                      className="pointer-events-none absolute -bottom-6 -right-4 h-20 w-20 rounded-full blur-xl"
                      style={{ background: `${g.accent}40` }}
                    />
                    <div className="absolute inset-0 grid place-items-center">
                      <Icon3D
                        name={GAME_ICON_3D[g.id]}
                        fallback={g.emoji}
                        className="h-20 w-20 object-contain"
                        style={{ filter: `drop-shadow(0 6px 10px ${g.accent}70)` }}
                      />
                    </div>
                  </div>
                )}
                {/* Тёмная вуаль поверх закрытой игры — арт совсем не читается */}
                {locked && <div className="pointer-events-none absolute inset-0 bg-black/45" />}
                <div className="absolute right-2 top-2">
                  <StatusBadge status={g.status} />
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Игра {g.num} · Неделя {g.week}
                </div>
                <div className="text-base font-bold leading-tight">{g.title}</div>
                <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{g.skill}</p>
                {g.status !== 'locked' && (
                  <div className="mt-2 flex items-center gap-1 text-xs font-bold" style={{ color: g.accent }}>
                    <Play size={11} fill="currentColor" /> Смотреть мультик
                  </div>
                )}
              </div>
            </motion.button>
          )})}
        </div>
      </section>

      {/* ==== ЛЕНТА + РЕЙТИНГ ==== */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Лента новостей / мультиков */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl font-bold">
            <Newspaper size={20} className="text-alfa" /> Лента доски
          </h2>
          <div className="space-y-3">
            {feed.map((f, i) => {
              const vg = games.find((x) => x.id === (f.gameId ?? refGame.id))
              const videoSrc = vg?.video_url || GAME_VIDEO[f.gameId ?? refGame.id] || ''
              const openVideo = () => { if (videoSrc) setVideo({ title: f.title, src: videoSrc }) }
              const interactive = f.kind === 'video' && !!videoSrc
              return (
              <motion.article
                key={f.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                onClick={interactive ? openVideo : undefined}
                {...(interactive
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `Смотреть ролик — ${f.title}`,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openVideo() }
                      },
                    }
                  : {})}
                className={`glass lift flex gap-3 rounded-3xl p-4 ${interactive ? 'cursor-pointer' : ''}`}
              >
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl sf-2 text-2xl">
                  <Icon3D name={FEED_ICON_3D[f.kind] ?? EMOJI_ICON_3D[f.emoji]} fallback={f.emoji} className="h-10 w-10 object-contain drop-shadow-sm" />
                  {f.kind === 'video' && (
                    <span className="btn-alfa absolute -bottom-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full">
                      <Play size={12} fill="currentColor" />
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold leading-tight">{f.title}</h3>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">{f.text}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-ink-soft">
                    {f.date}
                    {f.kind === 'video' && <span className="font-bold text-alfa-ink">▶ Смотреть ролик</span>}
                  </div>
                </div>
              </motion.article>
              )
            })}
          </div>
        </section>

        {/* Рейтинг команд */}
        <section id="rating">
          <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-xl font-bold">
            <Trophy size={20} className="text-alfa" /> Рейтинг команд
          </h2>
          <div className="glass-strong rounded-3xl p-3">
            {rating.slice(0, 8).map((t) => (
              <RatingRowView key={t.id} rank={t.rank} name={t.name} site={t.site} total={t.total} hue={t.hue} me={t.id === myTeamId} />
            ))}

            {myRating && myRating.rank > 8 && (
              <>
                <div className="my-1 text-center text-xs text-ink-soft">· · ·</div>
                <RatingRowView rank={myRating.rank} name={myRating.name} site={myRating.site} total={myRating.total} hue={myRating.hue} me />
              </>
            )}

            <Link
              to="/team"
              className="mt-2 flex items-center justify-center gap-1.5 rounded-2xl sf-1 py-2.5 text-sm font-bold text-alfa-ink transition-colors sf-hover"
            >
              Мой кабинет <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'done')
    return <Badge className="bg-success/15 text-success"><Check size={12} /> Сыграна</Badge>
  if (status === 'current')
    return <Badge className="bg-alfa/15 text-alfa-ink"><Flame size={12} /> Идёт</Badge>
  return (
    <Badge className="bg-black/10 text-ink-soft dark:bg-white/15">
      <Lock size={12} /> Скоро
    </Badge>
  )
}

function RatingRowView({
  rank, name, site, total, hue, me,
}: { rank: number; name: string; site: string; total: number; hue: number; me?: boolean }) {
  const medal = rank <= 3
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        me ? 'bg-alfa/10 ring-1 ring-alfa/30' : 'sf-hoversoft'
      }`}
    >
      <div className="grid w-7 shrink-0 place-items-center">
        {medal ? (
          <Icon3D name={rank === 1 ? 'trophy' : 'medalSilver'} className="h-6 w-6 object-contain drop-shadow-sm" />
        ) : (
          <span className="text-sm font-bold text-ink-soft">{rank}</span>
        )}
      </div>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold" style={{ background: teamAvatar(hue).bg, color: teamAvatar(hue).fg }}>
        {name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{name}{me && <span className="ml-1 text-alfa-ink">· вы</span>}</div>
        <div className="text-xs font-semibold text-ink-soft">{site}</div>
      </div>
      <div className="text-base font-bold"><CountUp value={total} /></div>
    </div>
  )
}
