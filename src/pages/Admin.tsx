import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Megaphone, RefreshCw, Check, Trophy, Loader2, MessageCircle, Bug, HelpCircle, Lightbulb, Eye, CheckCheck } from 'lucide-react'
import { type Game } from '../data/mock'
import {
  listAllTeamsAdmin, getScoresForGame, gradeMany, getGames, publishGame, pickCurrentGame,
  listFeedback, setFeedbackStatus, type AdminTeamRow, type FeedbackRow,
} from '../lib/db'
import MentorChatModal from '../components/MentorChatModal'
import { teamAvatar } from '../lib/ui'

interface Grade {
  submitted: boolean
  cases: number
  bonus: boolean
  superBonus: boolean
  fcr: number
  feedback: string
}

export default function Admin() {
  const [games, setGames] = useState<Game[]>([])
  const [gameId, setGameId] = useState('')
  const [published, setPublished] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)

  const [teams, setTeams] = useState<AdminTeamRow[]>([])
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  const [chatTeam, setChatTeam] = useState<AdminTeamRow | null>(null)

  // список игр + игра по умолчанию (текущая недели)
  useEffect(() => {
    getGames().then((gs) => {
      setGames(gs)
      setGameId((cur) => cur || pickCurrentGame(gs).id)
    })
  }, [])

  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [ts, scores] = await Promise.all([listAllTeamsAdmin(), getScoresForGame(gameId)])
      if (cancelled) return
      const init: Record<string, Grade> = {}
      for (const t of ts) {
        const s = scores[t.id]
        init[t.id] = s
          ? { submitted: s.cases > 0 || s.bonus > 0 || s.superBonus > 0 || !!s.feedback, cases: s.cases, bonus: s.bonus > 0, superBonus: s.superBonus > 0, fcr: s.fcr, feedback: s.feedback }
          : { submitted: false, cases: 0, bonus: false, superBonus: false, fcr: 0, feedback: '' }
      }
      setTeams(ts)
      setGrades(init)
      setPublished(false)
      setSaved(false)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [gameId])

  const submittedCount = Object.values(grades).filter((g) => g.submitted).length

  function upd(id: string, patch: Partial<Grade>) {
    setGrades((g) => ({ ...g, [id]: { ...g[id], ...patch } }))
    setSaved(false)
  }

  async function saveAll() {
    setSaving(true)
    setSaveError('')
    try {
      // Один пакетный upsert вместо 30 отдельных запросов.
      await gradeMany(
        teams.map((t) => {
          const g = grades[t.id]
          return {
            teamId: t.id, gameId,
            cases: g.submitted ? g.cases : 0,
            bonus: g.submitted && g.bonus ? 1 : 0,
            superBonus: g.submitted && g.superBonus ? 3 : 0,
            fcr: g.fcr,
            feedback: g.feedback,
          }
        }),
      )
      setSaved(true)
    } catch {
      setSaveError('Не удалось сохранить баллы. Проверьте соединение и попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  async function publish() {
    if (!gameId || publishing) return
    setPublishing(true)
    setSaveError('')
    try {
      await publishGame(gameId)
      setGames(await getGames()) // подтянуть новый статус игры
      setPublished(true)
    } catch {
      setSaveError('Не удалось опубликовать задание. Попробуйте ещё раз.')
    } finally {
      setPublishing(false)
    }
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
        <div className="rounded-2xl sf-1 px-4 py-2 text-center">
          <div className="font-display text-xl font-bold">{submittedCount}/{teams.length || 30}</div>
          <div className="text-xs font-semibold text-ink-soft">сдали ответ</div>
        </div>
      </div>

      {/* Выбор игры + публикация */}
      <div className="glass rounded-glass p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Игра недели</span>
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="rounded-2xl border border-black/5 sf-2 px-4 py-2.5 text-sm font-bold outline-none focus:border-alfa/40"
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
            disabled={publishing || !gameId}
            className="btn-alfa ml-auto flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {publishing
              ? <><Loader2 size={16} className="animate-spin" /> Публикую…</>
              : published
                ? <><Check size={16} /> Опубликовано на доске</>
                : <><Megaphone size={16} /> Выложить задание</>}
          </button>
        </div>
      </div>

      {/* Таблица оценивания */}
      <div className="glass-strong overflow-hidden rounded-glass">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <h2 className="font-display text-lg font-bold">Оценивание команд</h2>
          <div className="text-xs font-semibold text-ink-soft">
            Шкала: 0 — не сдал · 1 — &gt;3 ошибок · 2 — &lt;3 ошибок · 3 — без ошибок (за каждый кейс)
          </div>
        </div>

        {loading ? (
          <div className="grid h-40 place-items-center text-ink-soft">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
          <div className="hidden max-h-[540px] overflow-auto md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 z-10 sf-3 backdrop-blur">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="px-5 py-2.5">Команда</th>
                  <th className="px-2 py-2.5 text-center">Сдала</th>
                  <th className="px-2 py-2.5 text-center">Очки за кейсы</th>
                  <th className="px-2 py-2.5 text-center">Бонус +1</th>
                  <th className="px-2 py-2.5 text-center">Супер +3</th>
                  <th className="px-2 py-2.5 text-center">FCR %</th>
                  <th className="px-2 py-2.5 text-left">ОС тренера</th>
                  <th className="px-4 py-2.5 text-right">Итог</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const g = grades[t.id]
                  const sum = (g.submitted ? g.cases : 0) + (g.bonus ? 1 : 0) + (g.superBonus ? 3 : 0)
                  return (
                    <tr key={t.id} className="border-t border-black/5 sf-hoversoft">
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
                            onClick={() => setChatTeam(t)}
                            aria-label={`Чат с командой ${t.name}`}
                            title="Чат с командой"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa"
                          >
                            <MessageCircle size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-2 text-center">
                        <input
                          type="checkbox"
                          checked={g.submitted}
                          onChange={(e) => upd(t.id, { submitted: e.target.checked })}
                          className="h-5 w-5 accent-[var(--color-alfa)]"
                        />
                      </td>
                      <td className="px-2 text-center">
                        <input
                          type="number" min={0} max={30}
                          value={g.cases}
                          disabled={!g.submitted}
                          onChange={(e) => upd(t.id, { cases: Math.max(0, Math.min(30, +e.target.value)) })}
                          className="w-16 rounded-lg border border-black/10 sf-3 px-2 py-1 text-center font-bold outline-none focus:border-alfa/50 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-2 text-center">
                        <input type="checkbox" checked={g.bonus} disabled={!g.submitted} onChange={(e) => upd(t.id, { bonus: e.target.checked })} className="h-5 w-5 accent-[var(--color-alfa)] disabled:opacity-40" />
                      </td>
                      <td className="px-2 text-center">
                        <input type="checkbox" checked={g.superBonus} disabled={!g.submitted} onChange={(e) => upd(t.id, { superBonus: e.target.checked })} className="h-5 w-5 accent-[var(--color-gold)] disabled:opacity-40" />
                      </td>
                      <td className="px-2 text-center">
                        <input
                          type="number" min={0} max={100}
                          value={g.fcr}
                          disabled={!g.submitted}
                          onChange={(e) => upd(t.id, { fcr: Math.max(0, Math.min(100, +e.target.value)) })}
                          className="w-16 rounded-lg border border-black/10 sf-3 px-2 py-1 text-center font-bold outline-none focus:border-alfa/50 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-2">
                        <input
                          value={g.feedback}
                          disabled={!g.submitted}
                          onChange={(e) => upd(t.id, { feedback: e.target.value })}
                          placeholder="комментарий команде…"
                          className="w-52 rounded-lg border border-black/10 sf-3 px-2 py-1 text-xs outline-none focus:border-alfa/50 disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 text-right text-base font-bold">{sum}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Мобильная раскладка: каждая команда — карточка со столбиком полей */}
          <div className="space-y-3 p-4 md:hidden">
            {teams.map((t) => (
              <GradeCard
                key={t.id}
                t={t}
                g={grades[t.id]}
                onChange={(patch) => upd(t.id, patch)}
                onChat={() => setChatTeam(t)}
              />
            ))}
          </div>
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-black/5 px-5 py-4">
          <div className="flex items-center gap-2 text-sm">
            {saveError ? (
              <span className="font-semibold text-danger" role="alert">{saveError}</span>
            ) : (
              <span className="flex items-center gap-2 text-ink-soft">
                <Trophy size={16} style={{ color: 'var(--color-gold)' }} />
                После сохранения рейтинг на доске обновится автоматически.
              </span>
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={saveAll}
            disabled={loading || saving}
            className="btn-alfa flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <><Check size={16} /> Рейтинг обновлён</> : <><RefreshCw size={16} /> Сохранить и обновить рейтинг</>}
          </motion.button>
        </div>
      </div>

      <MentorChatModal
        open={!!chatTeam}
        onClose={() => setChatTeam(null)}
        teamId={chatTeam?.id ?? ''}
        teamName={chatTeam?.name ?? ''}
        asAdmin
      />

      <FeedbackPanel />
    </div>
  )
}

const CAT_ICON = { bug: Bug, question: HelpCircle, idea: Lightbulb } as const
const CAT_LABEL = { bug: 'Баг', question: 'Вопрос', idea: 'Идея' } as const

/** Отзывы тестировщиков (форма «Оставить отзыв» на сайте) — читает/меняет статус только админ. */
function FeedbackPanel() {
  const [items, setItems] = useState<FeedbackRow[] | null>(null)
  const [onlyNew, setOnlyNew] = useState(false)

  async function reload() {
    setItems(await listFeedback())
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
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
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
        <div className="grid h-32 place-items-center text-ink-soft"><Loader2 className="animate-spin" /></div>
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

/** Карточка оценивания одной команды для мобильной раскладки (замена строки таблицы). */
function GradeCard({
  t, g, onChange, onChat,
}: {
  t: AdminTeamRow
  g: Grade
  onChange: (patch: Partial<Grade>) => void
  onChat: () => void
}) {
  const sum = (g.submitted ? g.cases : 0) + (g.bonus ? 1 : 0) + (g.superBonus ? 3 : 0)
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
          onClick={onChat}
          aria-label={`Чат с командой ${t.name}`}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors hover:bg-alfa/10 hover:text-alfa"
        >
          <MessageCircle size={16} />
        </button>
      </div>

      <label className="mt-3 flex items-center justify-between gap-3 rounded-xl sf-1 px-3 py-2">
        <span className="text-sm font-semibold">Команда сдала ответ</span>
        <input
          type="checkbox"
          checked={g.submitted}
          onChange={(e) => onChange({ submitted: e.target.checked })}
          className="h-5 w-5 accent-[var(--color-alfa)]"
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">Очки за кейсы</span>
          <input
            type="number" min={0} max={30}
            value={g.cases}
            disabled={!g.submitted}
            onChange={(e) => onChange({ cases: Math.max(0, Math.min(30, +e.target.value)) })}
            className={fieldCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">FCR %</span>
          <input
            type="number" min={0} max={100}
            value={g.fcr}
            disabled={!g.submitted}
            onChange={(e) => onChange({ fcr: Math.max(0, Math.min(100, +e.target.value)) })}
            className={fieldCls}
          />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="flex items-center justify-between gap-2 rounded-lg sf-1 px-3 py-2 text-sm font-semibold">
          Бонус +1
          <input type="checkbox" checked={g.bonus} disabled={!g.submitted} onChange={(e) => onChange({ bonus: e.target.checked })} className="h-5 w-5 accent-[var(--color-alfa)] disabled:opacity-40" />
        </label>
        <label className="flex items-center justify-between gap-2 rounded-lg sf-1 px-3 py-2 text-sm font-semibold">
          Супер +3
          <input type="checkbox" checked={g.superBonus} disabled={!g.submitted} onChange={(e) => onChange({ superBonus: e.target.checked })} className="h-5 w-5 accent-[var(--color-gold)] disabled:opacity-40" />
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
}
