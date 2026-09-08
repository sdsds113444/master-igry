import { useEffect, useState } from 'react'
import { Trophy, Sparkles } from 'lucide-react'
import Dialog from './Dialog'
import { PRIZES_NOTE } from '../data/mock'
import { URM_SEEN_KEY } from './UrmNoticeModal'

/** Флаг «окно про подведение итогов уже показывали на этом устройстве». */
export const RESULTS_SEEN_KEY = 'mi.resultsPendingSeen'

/** Одноразовое (на устройство) окно после финала сезона: игры закончились, идёт
 *  подсчёт и согласование награждения, результатов пока нет.
 *
 *  Зачем окно, а не только плашка: команды приходят на доску за итогами в первый же
 *  день после марафона, и без объяснения пустой рейтинг читается как «нас забыли».
 *  Постоянное напоминание — плашка на доске (ResultsPendingBanner), она остаётся
 *  и после закрытия окна.
 *
 *  Ждём, пока закроют окно про УРМ: две модалки разом сбивают с толку. */
export default function ResultsPendingModal() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(RESULTS_SEEN_KEY)) return
      if (!localStorage.getItem(URM_SEEN_KEY)) return
      setOpen(true)
    } catch { /* приватный режим — просто не показываем */ }
  }, [])

  function close() {
    try { localStorage.setItem(RESULTS_SEEN_KEY, '1') } catch { /* покажем ещё раз, не критично */ }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      ariaLabel="Подводим итоги сезона"
      title={<><Trophy size={18} className="shrink-0 text-alfa" /> Подводим итоги сезона</>}
      panelClassName="w-full max-w-md"
    >
      <div className="px-6 pb-6 pt-1">
        <div className="flex items-start gap-3 rounded-2xl sf-1 px-4 py-3">
          <Sparkles size={20} className="mt-0.5 shrink-0 text-alfa" />
          <p className="text-sm leading-relaxed text-ink">
            <b>Девять недель, семь игр — всё позади.</b> Вы разобрали сотни клиентских
            ситуаций, спорили с нами по эталонам и не раз оказывались правы.
          </p>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink">
          Сейчас сверяем баллы за финальную игру и готовим награждение. Пока идёт подсчёт,
          итоговый рейтинг мы не публикуем — чтобы не пришлось его потом менять.
        </p>

        <p className="mt-3 rounded-2xl sf-1 px-4 py-3 text-xs leading-relaxed text-ink-soft">
          {PRIZES_NOTE}
        </p>

        <button onClick={close} className="btn-alfa mt-5 w-full rounded-2xl px-5 py-3 text-sm font-bold">
          Понятно, ждём
        </button>
      </div>
    </Dialog>
  )
}

/** Постоянная плашка на доске: окно закрывается навсегда, а вопрос «где итоги»
 *  остаётся, поэтому ответ должен висеть там, куда за итогами и приходят. */
export function ResultsPendingBanner() {
  return (
    <div className="glass-strong mb-4 rounded-glass p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Trophy size={22} className="mt-0.5 shrink-0 text-alfa" />
        <div className="min-w-0">
          <h3 className="font-display text-base font-extrabold sm:text-lg">
            Сезон завершён, идёт подведение итогов
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Баллы за финальную игру сверяются, награждение готовится. Итоговый рейтинг
            опубликуем, когда всё будет посчитано.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">{PRIZES_NOTE}</p>
        </div>
      </div>
    </div>
  )
}
