import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Trophy, Crown, Flame, Lock, Check, Play, ArrowRight, Medal } from 'lucide-react'
import { GAMES, TEAMS, FEED, MY_TEAM_CODE, CURRENT_GAME, GAME_VIDEO } from '../data/mock'
import Stars from '../components/Stars'
import VideoModal from '../components/VideoModal'

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.5 } }),
}

export default function Board() {
  const myTeam = TEAMS.find((t) => t.code === MY_TEAM_CODE)!
  const myRank = myTeam.rank ?? 1
  const doneCount = GAMES.filter((g) => g.status === 'done').length
  const heroStars = 3 + (Math.max(0, 30 - myRank) / 30) * 2 // 3..5
  const [video, setVideo] = useState<{ title: string; src: string } | null>(null)

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
        className="glass-strong relative overflow-hidden rounded-[30px]"
      >
        <div className="grid md:grid-cols-[1.25fr_1fr]">
          {/* Текст */}
          <div className="relative z-10 p-7 sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full bg-alfa/10 px-3 py-1 text-xs font-bold text-alfa">
              <Flame size={13} /> Сезон 1 · Неделя {CURRENT_GAME.week} из 9
            </span>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.1] sm:text-4xl">
              Общая доска <span className="text-gradient">чемпионата</span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-ink-soft">
              Здесь выходят мультики КОЯ, прилетают задания недели и обновляется рейтинг всех
              30 команд. Сейчас идёт игра «{CURRENT_GAME.title}».
            </p>

            {/* Прогресс сезона */}
            <div className="mt-5 max-w-md">
              <div className="mb-1.5 flex justify-between text-xs font-semibold text-ink-soft">
                <span>Прогресс сезона</span>
                <span>{doneCount} / {GAMES.length} игр</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-black/10">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg,#ff6a5c,#ef3124)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(doneCount / GAMES.length) * 100}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/team" className="btn-alfa flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold">
                <Play size={16} /> К заданию недели
              </Link>
              <a
                href="#rating"
                className="flex items-center gap-2 rounded-2xl bg-white/70 px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-white"
              >
                <Trophy size={16} /> Смотреть рейтинг
              </a>
            </div>
          </div>

          {/* Сцена с маскотом + карточка «Рейтинг героя» */}
          <div className="relative min-h-[260px]">
            <img
              src="/koya/koya-hero-crop.jpg"
              alt="Маскот КОЯ"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ objectPosition: '50% 58%' }}
            />
            {/* падающие коечки */}
            {[...Array(6)].map((_, i) => (
              <span
                key={i}
                className="pointer-events-none absolute top-0 text-2xl"
                style={{
                  left: `${12 + i * 14}%`,
                  animation: `koya-drop ${5 + (i % 3)}s linear ${i * 0.9}s infinite`,
                }}
              >
                {['🪙', '⭐', '🐾'][i % 3]}
              </span>
            ))}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 120 }}
              className="glass-dark absolute right-4 top-4 rounded-2xl px-4 py-3"
            >
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/70">
                Рейтинг героя
              </div>
              <div className="my-1"><Stars value={heroStars} size={20} /></div>
              <div className="font-display text-2xl font-extrabold">{heroStars.toFixed(1)}</div>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {/* ==== ЛЕНТА ИГР СЕЗОНА ==== */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-lg font-extrabold">
          🎬 Игры сезона
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {GAMES.map((g, i) => (
            <motion.div
              key={g.id}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              onClick={g.status !== 'locked' ? () => setVideo({ title: 'Мультик — ' + g.title, src: GAME_VIDEO[g.id] }) : undefined}
              className={`glass lift min-w-[190px] flex-1 rounded-3xl p-4 ${
                g.status === 'locked' ? 'opacity-60' : 'cursor-pointer'
              }`}
              style={g.status === 'current' ? { boxShadow: `0 0 0 2px ${g.accent}, 0 16px 40px -16px ${g.accent}` } : {}}
            >
              <div className="flex items-center justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-2xl text-2xl" style={{ background: `${g.accent}1a` }}>
                  {g.emoji}
                </span>
                <StatusBadge status={g.status} />
              </div>
              <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                Игра {g.num} · Неделя {g.week}
              </div>
              <div className="font-display text-[15px] font-extrabold leading-tight">{g.title}</div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{g.skill}</p>
              {g.status !== 'locked' && (
                <div className="mt-2 flex items-center gap-1 text-[11px] font-bold" style={{ color: g.accent }}>
                  <Play size={11} fill="currentColor" /> Смотреть мультик
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* ==== ЛЕНТА + РЕЙТИНГ ==== */}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Лента новостей / мультиков */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-lg font-extrabold">
            📰 Лента доски
          </h2>
          <div className="space-y-3">
            {FEED.map((f, i) => (
              <motion.article
                key={f.id}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                animate="show"
                onClick={f.kind === 'video' ? () => setVideo({ title: f.title, src: GAME_VIDEO[CURRENT_GAME.id] }) : undefined}
                className={`glass lift flex gap-3 rounded-3xl p-4 ${f.kind === 'video' ? 'cursor-pointer' : ''}`}
              >
                <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/70 text-2xl">
                  {f.emoji}
                  {f.kind === 'video' && (
                    <span className="btn-alfa absolute -bottom-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full">
                      <Play size={12} fill="currentColor" />
                    </span>
                  )}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-[15px] font-extrabold leading-tight">{f.title}</h3>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">{f.text}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] font-semibold text-ink-soft/70">
                    {f.date}
                    {f.kind === 'video' && <span className="font-bold text-alfa">▶ Смотреть ролик</span>}
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        {/* Рейтинг команд */}
        <section id="rating">
          <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-lg font-extrabold">
            🏆 Рейтинг команд
          </h2>
          <div className="glass-strong rounded-3xl p-3">
            {TEAMS.slice(0, 8).map((t, i) => (
              <RatingRow key={t.id} rank={i + 1} name={t.name} site={t.site} total={t.total} hue={t.hue} me={t.code === MY_TEAM_CODE} />
            ))}

            {myRank > 8 && (
              <>
                <div className="my-1 text-center text-xs text-ink-soft">· · ·</div>
                <RatingRow rank={myRank} name={myTeam.name} site={myTeam.site} total={myTeam.total} hue={myTeam.hue} me />
              </>
            )}

            <Link
              to="/team"
              className="mt-2 flex items-center justify-center gap-1.5 rounded-2xl bg-white/50 py-2.5 text-sm font-bold text-alfa transition-colors hover:bg-white"
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
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-600">
        <Check size={12} /> Сыграна
      </span>
    )
  if (status === 'current')
    return (
      <span className="flex items-center gap-1 rounded-full bg-alfa/15 px-2 py-1 text-[11px] font-bold text-alfa">
        <Flame size={12} /> Идёт
      </span>
    )
  return (
    <span className="flex items-center gap-1 rounded-full bg-black/10 px-2 py-1 text-[11px] font-bold text-ink-soft">
      <Lock size={12} /> Скоро
    </span>
  )
}

function RatingRow({
  rank, name, site, total, hue, me,
}: { rank: number; name: string; site: string; total: number; hue: number; me?: boolean }) {
  const medal = rank <= 3
  const medalColor = ['#ffc244', '#c9cdd6', '#e29a5b'][rank - 1]
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
        me ? 'bg-alfa/10 ring-1 ring-alfa/30' : 'hover:bg-white/50'
      }`}
    >
      <div className="grid w-7 shrink-0 place-items-center">
        {medal ? (
          rank === 1 ? <Crown size={20} style={{ color: medalColor }} /> : <Medal size={18} style={{ color: medalColor }} />
        ) : (
          <span className="text-sm font-bold text-ink-soft">{rank}</span>
        )}
      </div>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-extrabold text-white" style={{ background: `hsl(${hue} 70% 55%)` }}>
        {name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{name}{me && <span className="ml-1 text-alfa">· вы</span>}</div>
        <div className="text-[11px] font-semibold text-ink-soft">{site}</div>
      </div>
      <div className="font-display text-base font-extrabold">{total}</div>
    </div>
  )
}
