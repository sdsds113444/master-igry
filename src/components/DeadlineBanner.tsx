import { useEffect, useState } from 'react'
import { AlarmClock, Lock } from 'lucide-react'
import { humanTimeLeft } from '../lib/ui'

/** Крупная плашка дедлайна для команд: большой обратный отсчёт + короткий призыв.
 *
 *  Показывается ТОЛЬКО тем, кто ещё не сдал — смысл в том, чтобы подтолкнуть, а не
 *  мозолить глаза тем, кто уже прислал. За 6 часов до дедлайна становится красной
 *  во всю ширину, после дедлайна — «приём закрыт».
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

  if (left <= 0) {
    return (
      <div
        role="status"
        className="mx-auto flex max-w-6xl items-center justify-center gap-2.5 rounded-2xl sf-2 px-5 py-4 text-base font-bold text-ink-soft"
      >
        <Lock size={20} className="shrink-0" />
        Приём ответов закрыт
      </div>
    )
  }

  const urgent = left <= 6 * 3600 * 1000
  return (
    <div
      role="status"
      className={`mx-auto flex max-w-6xl items-center gap-4 rounded-2xl px-5 py-4 sm:px-6 sm:py-5 ${
        urgent ? 'bg-alfa text-white shadow-lg' : 'bg-alfa/10 text-ink'
      }`}
    >
      <AlarmClock
        size={34}
        className={`shrink-0 ${urgent ? 'animate-pulse' : 'text-alfa'}`}
      />
      <div className="min-w-0">
        <div className="text-xl font-extrabold leading-tight tracking-tight sm:text-3xl">
          {urgent ? 'Осталось' : 'До дедлайна'} {humanTimeLeft(left)}
        </div>
        <div className={`mt-0.5 text-sm font-semibold ${urgent ? 'text-white/85' : 'text-ink-soft'}`}>
          {urgent ? 'Успейте сдать ответ!' : 'Поторопитесь сдать ответ'}
        </div>
      </div>
    </div>
  )
}
