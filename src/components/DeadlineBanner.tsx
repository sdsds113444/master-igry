import { useEffect, useState } from 'react'
import { AlarmClock, Lock } from 'lucide-react'

/** Сколько осталось, человеческим языком: «1 дн 3 ч», «4 ч 12 мин», «7 мин 30 с». */
function humanLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d} дн ${h} ч`
  if (h > 0) return `${h} ч ${m} мин`
  if (m > 0) return `${m} мин ${sec} с`
  return `${sec} с`
}

/** Плашка дедлайна для команд: живой обратный отсчёт с нарастающей срочностью.
 *
 *  Показывается ТОЛЬКО тем, кто ещё не сдал — смысл плашки в том, чтобы напомнить
 *  и не дёргать тех, кто уже всё прислал. За 6 часов до дедлайна становится красной
 *  во всю ширину (тогда её невозможно пропустить), после дедлайна — «приём закрыт».
 *
 *  Таймер живёт в состоянии ЭТОГО компонента, поэтому раз в секунду перерисовывается
 *  только плашка, а не весь Layout со страницами. */
export default function DeadlineBanner({ deadlineAt, submitted }: {
  deadlineAt: string | null
  submitted: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])

  if (!deadlineAt || submitted) return null
  const end = new Date(deadlineAt).getTime()
  if (Number.isNaN(end)) return null

  const left = end - now
  const when = new Date(end).toLocaleString('ru', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  if (left <= 0) {
    return (
      <div
        role="status"
        className="mx-auto flex max-w-6xl items-center gap-2.5 rounded-2xl sf-2 px-4 py-3 text-sm font-semibold text-ink-soft"
      >
        <Lock size={16} className="shrink-0" />
        Приём ответов по этому заданию закрыт ({when}).
      </div>
    )
  }

  const urgent = left <= 6 * 3600 * 1000
  return (
    <div
      role="status"
      className={`mx-auto flex max-w-6xl flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl px-4 py-3 text-sm font-bold ${
        urgent ? 'bg-alfa text-white shadow-lg' : 'bg-alfa/5 text-ink'
      }`}
    >
      <AlarmClock size={17} className={`shrink-0 ${urgent ? 'animate-pulse' : 'text-alfa'}`} />
      <span>{urgent ? 'Успейте сдать ответ!' : 'Не забудьте сдать ответ.'}</span>
      <span className="font-extrabold">До дедлайна {humanLeft(left)}</span>
      <span className={`font-semibold ${urgent ? 'text-white/80' : 'text-ink-soft'}`}>· {when}</span>
    </div>
  )
}
