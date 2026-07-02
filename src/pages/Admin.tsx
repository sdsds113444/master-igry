import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, RefreshCw, Check, Plus, Trophy, Upload } from 'lucide-react'
import { TEAMS, GAMES, CURRENT_GAME } from '../data/mock'

interface Grade {
  submitted: boolean
  cases: number
  bonus: boolean
  superBonus: boolean
  feedback: string
}

export default function Admin() {
  const [gameId, setGameId] = useState(CURRENT_GAME.id)
  const [published, setPublished] = useState(false)
  const [saved, setSaved] = useState(false)

  // локальный черновик оценок (демо)
  const [grades, setGrades] = useState<Record<string, Grade>>(() => {
    const init: Record<string, Grade> = {}
    for (const t of TEAMS) {
      const s = t.perGame[CURRENT_GAME.id]
      init[t.id] = {
        submitted: s.cases > 0,
        cases: s.cases,
        bonus: s.bonus > 0,
        superBonus: s.superBonus > 0,
        feedback: s.feedback ?? '',
      }
    }
    return init
  })

  const teams = useMemo(() => [...TEAMS].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)), [])
  const submittedCount = Object.values(grades).filter((g) => g.submitted).length

  function upd(id: string, patch: Partial<Grade>) {
    setGrades((g) => ({ ...g, [id]: { ...g[id], ...patch } }))
    setSaved(false)
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="glass-strong flex flex-wrap items-center gap-4 rounded-[28px] p-5">
        <img
          src="/koya/koya-sit-crop.jpg"
          alt="КОЯ"
          className="h-14 w-14 shrink-0 rounded-3xl object-cover shadow-md ring-2 ring-white/70"
          style={{ objectPosition: 'center 12%' }}
        />
        <div className="mr-auto">
          <h1 className="font-display text-2xl font-extrabold">Панель организатора</h1>
          <p className="text-sm text-ink-soft">Выкладывайте задания, принимайте ответы, ставьте баллы.</p>
        </div>
        <div className="rounded-2xl bg-white/60 px-4 py-2 text-center">
          <div className="font-display text-xl font-extrabold">{submittedCount}/30</div>
          <div className="text-[11px] font-semibold text-ink-soft">сдали ответ</div>
        </div>
      </div>

      {/* Выбор игры + публикация */}
      <div className="glass rounded-[28px] p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">Игра недели</span>
            <select
              value={gameId}
              onChange={(e) => { setGameId(e.target.value); setPublished(false) }}
              className="rounded-2xl border border-black/5 bg-white/70 px-4 py-2.5 text-sm font-bold outline-none focus:border-alfa/40"
            >
              {GAMES.map((g) => (
                <option key={g.id} value={g.id}>
                  Игра {g.num}: {g.title}
                </option>
              ))}
            </select>
          </label>

          <button className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-white">
            <Upload size={16} /> Прикрепить кейсы (.xlsx)
          </button>
          <button className="flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-white">
            <Plus size={16} /> Добавить мультик
          </button>

          <button
            onClick={() => setPublished(true)}
            className="btn-alfa ml-auto flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold"
          >
            {published ? <><Check size={16} /> Опубликовано на доске</> : <><Megaphone size={16} /> Выложить задание</>}
          </button>
        </div>
      </div>

      {/* Таблица оценивания */}
      <div className="glass-strong overflow-hidden rounded-[28px]">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <h2 className="font-display text-lg font-extrabold">Оценивание команд</h2>
          <div className="text-xs font-semibold text-ink-soft">
            Шкала: 0 — не сдал · 1 — &gt;3 ошибок · 2 — &lt;3 ошибок · 3 — без ошибок (за каждый кейс)
          </div>
        </div>

        <div className="max-h-[540px] overflow-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 z-10 bg-white/80 backdrop-blur">
              <tr className="text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                <th className="px-5 py-2.5">Команда</th>
                <th className="px-2 py-2.5 text-center">Сдала</th>
                <th className="px-2 py-2.5 text-center">Очки за кейсы</th>
                <th className="px-2 py-2.5 text-center">Бонус +1</th>
                <th className="px-2 py-2.5 text-center">Супер +3</th>
                <th className="px-2 py-2.5 text-left">ОС тренера</th>
                <th className="px-4 py-2.5 text-right">Итог</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const g = grades[t.id]
                const sum = (g.submitted ? g.cases : 0) + (g.bonus ? 1 : 0) + (g.superBonus ? 3 : 0)
                return (
                  <tr key={t.id} className="border-t border-black/5 hover:bg-white/40">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-extrabold text-white" style={{ background: `hsl(${t.hue} 70% 55%)` }}>
                          {t.name.slice(0, 1)}
                        </span>
                        <div>
                          <div className="font-bold">{t.name}</div>
                          <div className="text-[11px] text-ink-soft">{t.code} · {t.site}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 text-center">
                      <input
                        type="checkbox"
                        checked={g.submitted}
                        onChange={(e) => upd(t.id, { submitted: e.target.checked })}
                        className="h-4 w-4 accent-[var(--color-alfa)]"
                      />
                    </td>
                    <td className="px-2 text-center">
                      <input
                        type="number" min={0} max={30}
                        value={g.cases}
                        disabled={!g.submitted}
                        onChange={(e) => upd(t.id, { cases: Math.max(0, Math.min(30, +e.target.value)) })}
                        className="w-16 rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-center font-bold outline-none focus:border-alfa/50 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-2 text-center">
                      <input type="checkbox" checked={g.bonus} disabled={!g.submitted} onChange={(e) => upd(t.id, { bonus: e.target.checked })} className="h-4 w-4 accent-[var(--color-alfa)] disabled:opacity-40" />
                    </td>
                    <td className="px-2 text-center">
                      <input type="checkbox" checked={g.superBonus} disabled={!g.submitted} onChange={(e) => upd(t.id, { superBonus: e.target.checked })} className="h-4 w-4 accent-[var(--color-gold)] disabled:opacity-40" />
                    </td>
                    <td className="px-2">
                      <input
                        value={g.feedback}
                        disabled={!g.submitted}
                        onChange={(e) => upd(t.id, { feedback: e.target.value })}
                        placeholder="комментарий команде…"
                        className="w-52 rounded-lg border border-black/10 bg-white/80 px-2 py-1 text-xs outline-none focus:border-alfa/50 disabled:opacity-40"
                      />
                    </td>
                    <td className="px-4 text-right font-display text-base font-extrabold">{sum}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-black/5 px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-ink-soft">
            <Trophy size={16} style={{ color: 'var(--color-gold)' }} />
            После сохранения рейтинг на доске обновится автоматически.
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setSaved(true)}
            className="btn-alfa flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold"
          >
            {saved ? <><Check size={16} /> Рейтинг обновлён</> : <><RefreshCw size={16} /> Сохранить и обновить рейтинг</>}
          </motion.button>
        </div>
      </div>
    </div>
  )
}
