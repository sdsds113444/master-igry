import { motion } from 'framer-motion'
import { BookOpen, Gift } from 'lucide-react'
import { RULES, PRIZES, PRIZES_NOTE } from '../data/mock'
import { fadeUp } from '../lib/ui'
import Badge from '../components/Badge'

export default function Rules() {
  return (
    <div className="space-y-6">
      {/* Шапка */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong relative overflow-hidden rounded-glass"
      >
        <div className="grid items-center md:grid-cols-[1.4fr_1fr]">
          <div className="p-7 sm:p-9">
            <span className="inline-flex items-center gap-2 rounded-full bg-alfa/10 px-3 py-1 text-xs font-bold text-alfa">
              <BookOpen size={14} /> Регламент конкурса
            </span>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              Правила <span className="text-gradient">«Героев на линии»</span>
            </h1>
            <p className="mt-2 max-w-md text-sm text-ink-soft">
              Всё, что нужно знать команде: формат, ритм недели, как считаются баллы и что можно выиграть.
            </p>
          </div>
          <div className="relative hidden min-h-[200px] self-stretch overflow-hidden rounded-glass md:m-3 md:block">
            <img src="/koya/koya-sit-crop.webp" alt="КОЯ" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 20%' }} />
          </div>
        </div>
      </motion.section>

      {/* Правила */}
      <section>
        <h2 className="mb-3 px-1 font-display text-lg font-bold">Как всё устроено</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {RULES.map((r, i) => (
            <motion.div
              key={r.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="glass lift flex gap-3 rounded-3xl p-4"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl sf-2 text-2xl" aria-hidden="true">
                {r.icon}
              </span>
              <div>
                <h3 className="text-base font-bold">{r.title}</h3>
                <p className="mt-0.5 text-sm text-ink-soft">{r.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Призы */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 px-1 font-display text-lg font-bold"><Gift size={20} className="text-alfa" /> Призы сезона</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PRIZES.map((p, i) => (
            <motion.div
              key={p.place}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className="glass-strong lift overflow-hidden rounded-3xl p-5"
              style={{ boxShadow: `0 14px 40px -18px ${p.accent}` }}
            >
              <div className="flex items-center gap-2">
                <span className="text-3xl" aria-hidden="true">{p.emoji}</span>
                <Badge style={{ background: p.chipBg, color: p.chipFg }}>{p.place}</Badge>
              </div>
              <h3 className="mt-3 font-display text-lg font-bold leading-tight">{p.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{p.text}</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-3 px-1 text-xs text-ink-soft">{PRIZES_NOTE}</p>
      </section>
    </div>
  )
}
