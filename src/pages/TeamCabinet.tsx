import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Play, FileDown, Upload, Send, MessageCircle, Crown, CheckCircle2, Clock, Star,
} from 'lucide-react'
import { TEAMS, MY_TEAM_CODE, CURRENT_TASK, GAMES, GAME_VIDEO, MENTOR_CONTACT } from '../data/mock'
import Stars from '../components/Stars'
import VideoModal from '../components/VideoModal'

const ROSTER = [
  'Максим К. (капитан)', 'Анна С.', 'Игорь В.', 'Пётр Л.', 'Дарья М.',
  'Олег Р.', 'Юлия Н.', 'Сергей Ф.', 'Мария Т.', 'Илья Г.',
]

const diffColor: Record<string, string> = {
  Лёгкий: '#1ea672',
  Средний: '#e8b21e',
  Сложный: '#ef3124',
}

export default function TeamCabinet() {
  const me = TEAMS.find((t) => t.code === MY_TEAM_CODE)!
  const heroStars = 3 + (Math.max(0, 30 - (me.rank ?? 1)) / 30) * 2
  const [answer, setAnswer] = useState('')
  const [sent, setSent] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

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
          <Stat label="Место" value={`#${me.rank}`} />
          <Stat label="Очки" value={me.total} />
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
        {/* ==== ЗАДАНИЕ НЕДЕЛИ ==== */}
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
              <button className="group flex min-h-[112px] flex-col justify-end rounded-2xl bg-white/70 p-4 text-left transition-colors hover:bg-white">
                <span className="mb-1.5 inline-grid h-9 w-9 place-items-center rounded-full bg-alfa/10 text-alfa">
                  <FileDown size={16} />
                </span>
                <div className="text-sm font-bold">Скачать кейсы</div>
                <div className="truncate text-xs text-ink-soft">{CURRENT_TASK.fileName}</div>
              </button>
            </div>
          </div>

          {/* Кейсы */}
          <div className="space-y-3">
            {CURRENT_TASK.cases.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="glass lift rounded-3xl p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-xl bg-white/70 text-sm font-extrabold">{i + 1}</span>
                    <h3 className="font-display text-[15px] font-extrabold">{c.title}</h3>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
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
                  <button className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-white">
                    <Upload size={16} /> Прикрепить файл
                  </button>
                  <button
                    onClick={() => setSent(true)}
                    className="btn-alfa ml-auto flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold"
                  >
                    <Send size={16} /> Отправить тренеру
                  </button>
                </div>
              </>
            )}
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
                  #{me.rank} место из 30
                </div>
              </div>
            </div>
          </div>

          {/* Состав */}
          <div className="glass rounded-[28px] p-5">
            <h3 className="mb-3 font-display text-lg font-extrabold">Состав команды</h3>
            <ul className="space-y-1.5">
              {ROSTER.map((p, i) => (
                <li key={p} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/50">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-white/70 text-xs font-bold">{p.slice(0, 1)}</span>
                  <span className="text-sm font-semibold">{p}</span>
                  {i === 0 && <Crown size={15} className="ml-auto" style={{ color: 'var(--color-gold)' }} />}
                </li>
              ))}
            </ul>
          </div>

          {/* История баллов */}
          <div className="glass rounded-[28px] p-5">
            <h3 className="mb-3 font-display text-lg font-extrabold">Баллы по играм</h3>
            <div className="space-y-2">
              {GAMES.filter((g) => g.status !== 'locked').map((g) => {
                const s = me.perGame[g.id]
                const sum = s.cases + s.bonus + s.superBonus
                return (
                  <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-white/50 px-3 py-2">
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
