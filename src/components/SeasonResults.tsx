import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Trophy, Sparkles, Gift, Award } from 'lucide-react'
import Dialog from './Dialog'
import Confetti from './Confetti'
import { URM_SEEN_KEY, URM_CLOSED_EVENT } from './UrmNoticeModal'

/** Итоги сезона: кто на каком месте.
 *
 *  Названия команд НЕ лежат в коде: репозиторий публичный. Они приходят при сборке из
 *  переменной окружения Vercel VITE_SEASON_RESULTS (JSON вида
 *  [{"place":1,"prize":"…","teams":[{"name":"…"}]}, …]). prize — что получает место, необязательно. Нет переменной или она битая —
 *  итогов нет, и на доске остаётся прежняя плашка «подводим итоги». */
export interface PodiumTeam { name: string; site?: string }
export interface PodiumPlace { place: 1 | 2 | 3; teams: PodiumTeam[]; prize?: string }

function readResults(): PodiumPlace[] | null {
  const raw = import.meta.env.VITE_SEASON_RESULTS as string | undefined
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PodiumPlace[]
    const ok = Array.isArray(parsed) && parsed.length > 0
      && parsed.every((p) => [1, 2, 3].includes(p.place) && Array.isArray(p.teams) && p.teams.length > 0
        && p.teams.every((t) => typeof t.name === 'string' && t.name.trim()))
    return ok ? [...parsed].sort((a, b) => a.place - b.place) : null
  } catch {
    return null
  }
}

export const SEASON_RESULTS = readResults()

/** Награда не за места, а за работу весь сезон (ачивка активным командам). Тоже из
 *  настройки Vercel, VITE_SEASON_RESULTS_EXTRA: «Заголовок|Текст». Нет — карточки нет. */
function readExtra(): { title: string; text: string } | null {
  const raw = (import.meta.env.VITE_SEASON_RESULTS_EXTRA as string | undefined)?.trim()
  if (!raw) return null
  const [title, ...rest] = raw.split('|')
  return { title: title.trim(), text: rest.join('|').trim() }
}
const EXTRA = readExtra()

function ExtraAward({ compact = false }: { compact?: boolean }) {
  if (!EXTRA) return null
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-violet/30 bg-violet/10 ${compact ? 'mt-2 px-3 py-2.5' : 'mt-6 px-4 py-3.5'}`}>
      <span className={`grid shrink-0 place-items-center rounded-full bg-violet/20 text-violet ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}>
        <Award size={compact ? 18 : 22} />
      </span>
      <div className="min-w-0">
        <div className={`font-display font-extrabold leading-snug ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>{EXTRA.title}</div>
        {EXTRA.text && <div className={`mt-0.5 leading-relaxed text-ink-soft ${compact ? 'text-xs' : 'text-sm'}`}>{EXTRA.text}</div>}
      </div>
    </div>
  )
}

const PLACE = {
  1: { label: '1 место', medal: '/results/medal-zoloto.webp', ring: 'var(--color-gold)', glow: 'rgba(255,194,68,.45)', height: 'md:min-h-[260px]' },
  2: { label: '2 место', medal: '/results/medal-serebro.webp', ring: 'var(--color-silver)', glow: 'rgba(201,205,214,.45)', height: 'md:min-h-[220px]' },
  3: { label: '3 место', medal: '/results/medal-bronza.webp', ring: 'var(--color-bronze)', glow: 'rgba(226,154,91,.45)', height: 'md:min-h-[190px]' },
} as const

function PlaceCard({ p, i, compact = false }: { p: PodiumPlace; i: number; compact?: boolean }) {
  const s = PLACE[p.place]
  const reduce = useReducedMotion()
  if (compact) {
    // В окне — строкой: медаль слева, команды справа, чтобы всё влезло без прокрутки.
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
        className="flex items-center gap-3 rounded-2xl sf-1 px-3 py-2.5"
        style={{ boxShadow: `inset 0 0 0 2px ${s.ring}` }}
      >
        <img src={s.medal} alt="" aria-hidden="true" className="h-11 w-11 shrink-0 object-contain drop-shadow" />
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">{s.label}</div>
          <div className="font-display text-sm font-extrabold leading-snug">
            {p.teams.map((t) => t.name).join(' · ')}
          </div>
          {p.prize && (
            <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-ink-soft">
              <Gift size={12} className="shrink-0 text-alfa" /> {p.prize}
            </div>
          )}
        </div>
      </motion.div>
    )
  }
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 + i * 0.12 }}
      className={`relative flex flex-col items-center rounded-3xl sf-1 px-4 pb-5 pt-4 text-center ${compact ? '' : s.height} ${p.place === 1 ? 'md:-mt-6' : ''}`}
      style={{ boxShadow: `0 18px 44px -20px ${s.glow}, inset 0 0 0 2px ${s.ring}` }}
    >
      <img src={s.medal} alt="" aria-hidden="true" className={`${compact ? 'h-12 w-12' : p.place === 1 ? 'h-20 w-20' : 'h-16 w-16'} object-contain drop-shadow-md`} />
      <div
        className="mt-2 rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide"
        style={{ background: s.ring, color: p.place === 3 ? '#3b1f06' : '#2c2408' }}
      >
        {s.label}
      </div>
      <ul className="mt-3 space-y-2">
        {p.teams.map((t) => (
          <li key={t.name}>
            <div className={`font-display font-extrabold leading-tight ${compact ? 'text-base' : p.place === 1 ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'}`}>
              {t.name}
            </div>
          </li>
        ))}
      </ul>
      {p.prize && (
        <div className="mt-auto flex items-center gap-1.5 rounded-2xl bg-alfa/10 px-3 py-2 pt-2 text-sm font-bold text-alfa-ink" style={{ marginTop: '1rem' }}>
          <Gift size={16} className="shrink-0 text-alfa" /> {p.prize}
        </div>
      )}
    </motion.div>
  )
}

/** Пьедестал: на широком экране 2 — 1 — 3, на узком по порядку мест. */
function Podium({ results, compact = false }: { results: PodiumPlace[]; compact?: boolean }) {
  // Классы порядка выписаны целиком: Tailwind не видит классы, собранные из строк.
  const order = { 1: 'md:order-2', 2: 'md:order-1', 3: 'md:order-3' } as const
  return (
    <div className={`grid ${compact ? 'gap-2' : 'gap-3 md:grid-cols-3 md:items-end md:gap-4'}`}>
      {results.map((p, i) => (
        <div key={p.place} className={compact ? '' : order[p.place]}>
          <PlaceCard p={p} i={i} compact={compact} />
        </div>
      ))}
    </div>
  )
}

/** Большая праздничная плашка на доске вместо «подводим итоги». */
export function SeasonResultsBanner({ results }: { results: PodiumPlace[] }) {
  return (
    <section
      aria-label="Итоги сезона"
      className="glass-strong relative mb-4 overflow-hidden rounded-glass"
    >
      <div className="pointer-events-none absolute inset-0 z-20"><Confetti count={70} /></div>
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-gold/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-10 h-72 w-72 rounded-full bg-alfa/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-10 h-60 w-60 rounded-full bg-violet/20 blur-3xl" />

      <div className="relative grid gap-6 p-6 sm:p-9 lg:grid-cols-[1fr_260px] lg:items-center">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-status-amber">
            <Trophy size={14} /> Итоги сезона 1
          </span>
          <h2 className="mt-3 font-display text-3xl font-extrabold leading-[1.08] sm:text-5xl">
            Победители <span className="text-gradient">чемпионата</span>
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
            Семь игр, девять недель и сотни клиентских ситуаций позади. Поздравляем команды,
            которые прошли сезон лучше всех!
          </p>
          <div className="mt-7 md:mt-10">
            <Podium results={results} />
          </div>
          <ExtraAward />
          <p className="mt-6 flex items-start gap-2 text-sm leading-relaxed text-ink-soft">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-status-amber" />
            Спасибо всем командам за сезон — за каждый разобранный кейс, споры по эталонам и азарт.
          </p>
        </div>
        <img
          src="/results/koya-trophy.webp"
          alt="Коя с кубком"
          className="mx-auto hidden w-56 drop-shadow-2xl lg:block lg:w-full"
        />
      </div>
    </section>
  )
}

/** Флаг «окно с итогами уже показывали в этой сессии». */
const RESULTS_SHOWN_KEY = 'mi.seasonResultsShown'

/** Окно с итогами при входе: раз за сессию, после окна про УРМ. */
export function SeasonResultsModal({ results }: { results: PodiumPlace[] }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    function maybeShow() {
      try {
        if (sessionStorage.getItem(RESULTS_SHOWN_KEY)) return
        if (!localStorage.getItem(URM_SEEN_KEY)) return
        setOpen(true)
      } catch { /* приватный режим — просто не показываем */ }
    }
    maybeShow()
    window.addEventListener(URM_CLOSED_EVENT, maybeShow)
    return () => window.removeEventListener(URM_CLOSED_EVENT, maybeShow)
  }, [])

  function close() {
    try { sessionStorage.setItem(RESULTS_SHOWN_KEY, '1') } catch { /* покажем ещё раз, не критично */ }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      ariaLabel="Итоги сезона"
      title={<><Trophy size={18} className="shrink-0 text-status-amber" /> Итоги сезона</>}
      panelClassName="w-full max-w-lg overflow-hidden"
    >
      <div className="relative">
        {open && <div className="pointer-events-none absolute inset-0 z-10"><Confetti count={60} /></div>}
        <div className="relative overflow-hidden bg-gradient-to-br from-gold/25 via-alfa/15 to-transparent px-6 pb-4 pt-3">
          <div className="flex items-center gap-4">
            <img src="/results/koya-trophy.webp" alt="" aria-hidden="true" className="h-24 w-24 shrink-0 object-contain drop-shadow-lg sm:h-28 sm:w-28" />
            <div className="min-w-0">
              <p className="font-display text-xl font-extrabold leading-tight sm:text-2xl">Победители чемпионата</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">Поздравляем команды, которые прошли сезон лучше всех!</p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 pt-3">
          <Podium results={results} compact />
          <ExtraAward compact />
          <button onClick={close} className="btn-alfa mt-5 w-full rounded-2xl px-5 py-3 text-sm font-bold">
            Ура, поздравляем! 🎉
          </button>
        </div>
      </div>
    </Dialog>
  )
}
