import { useEffect, useState } from 'react'
import { AlarmClock } from 'lucide-react'
import Dialog from './Dialog'
import { humanTimeLeft } from '../lib/ui'

/** Модалка дедлайна поверх всего сайта — выскакивает при заходе команде, которая ещё
 *  не сдала. Показывается ОДИН раз за сессию вкладки (решает Layout): если выскакивать
 *  на каждую перезагрузку, её начинают закрывать рефлекторно не читая, и смысл теряется.
 *
 *  Кнопка ведёт прямо к заданию — чтобы напоминание сразу превращалось в действие. */
export default function DeadlineModal({ open, onClose, onGo, deadlineAt }: {
  open: boolean
  onClose: () => void
  onGo: () => void
  deadlineAt: string | null
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [open])

  if (!deadlineAt) return null
  const end = new Date(deadlineAt).getTime()
  if (Number.isNaN(end)) return null

  const left = end - now
  const urgent = left <= 6 * 3600 * 1000

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabel="Напоминание о дедлайне"
      title={<><AlarmClock size={18} className="shrink-0 text-alfa" /> Дедлайн</>}
      panelClassName="w-full max-w-md"
    >
      <div className="px-6 pb-6 pt-1 text-center">
        <div
          className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${
            urgent ? 'bg-alfa text-white' : 'bg-alfa/10 text-alfa'
          }`}
        >
          <AlarmClock size={38} className={urgent ? 'animate-pulse' : ''} />
        </div>

        <div className="mt-4 text-3xl font-extrabold leading-tight tracking-tight">
          {left > 0
            ? `${urgent ? 'Осталось' : 'До дедлайна'} ${humanTimeLeft(left)}`
            : 'Приём ответов закрыт'}
        </div>
        <p className="mx-auto mt-2 max-w-xs text-sm font-semibold text-ink-soft">
          {left > 0
            ? (urgent ? 'Успейте сдать ответ!' : 'Поторопитесь сдать ответ')
            : 'Ответы по этому заданию больше не принимаются.'}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button onClick={onGo} className="btn-alfa flex-1 rounded-2xl px-5 py-3 text-sm font-bold">
            Перейти к заданию
          </button>
          <button
            onClick={onClose}
            className="tap flex-1 rounded-2xl sf-2 px-5 py-3 text-sm font-bold text-ink transition-colors sf-hover"
          >
            Позже
          </button>
        </div>
      </div>
    </Dialog>
  )
}
