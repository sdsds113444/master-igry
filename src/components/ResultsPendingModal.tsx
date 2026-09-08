import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import Dialog from './Dialog'
import Confetti from './Confetti'
import { PRIZES_NOTE } from '../data/mock'
import { URM_SEEN_KEY, URM_CLOSED_EVENT } from './UrmNoticeModal'

/** Флаг «окно про подведение итогов уже показывали на этом устройстве». */
export const RESULTS_SEEN_KEY = 'mi.resultsPendingSeen'

/** Цифры сезона. Не украшение: команда должна увидеть масштаб того, что прошла,
 *  а не абстрактное «спасибо за участие». Все взяты из базы на 08.09.2026. */
const STATS = [
  { value: '7', label: 'игр' },
  { value: '9', label: 'недель' },
  { value: '145', label: 'работ' },
  { value: '26', label: 'команд' },
]

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
    function maybeShow() {
      try {
        if (localStorage.getItem(RESULTS_SEEN_KEY)) return
        if (!localStorage.getItem(URM_SEEN_KEY)) return
        setOpen(true)
      } catch { /* приватный режим — просто не показываем */ }
    }
    maybeShow()
    // На новом устройстве УРМ-окно ещё открыто в момент монтирования, и без подписки
    // финальное окно ждало бы перезагрузки страницы.
    window.addEventListener(URM_CLOSED_EVENT, maybeShow)
    return () => window.removeEventListener(URM_CLOSED_EVENT, maybeShow)
  }, [])

  function close() {
    try { localStorage.setItem(RESULTS_SEEN_KEY, '1') } catch { /* покажем ещё раз, не критично */ }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      ariaLabel="Финал сезона, подводим итоги"
      title={<><Trophy size={18} className="shrink-0 text-status-amber" /> Финал сезона</>}
      panelClassName="w-full max-w-lg overflow-hidden"
    >
      <div className="relative">
        {/* Залп один раз при открытии — окно и так показывается единожды на устройство. */}
        {open && <div className="pointer-events-none absolute inset-0 z-10"><Confetti count={60} /></div>}

        {/* Шапка с маскотом: КОЯ вёл сезон все девять недель, ему и закрывать. */}
        <div className="relative overflow-hidden bg-gradient-to-br from-alfa/25 via-violet/15 to-transparent px-6 pb-5 pt-4">
          <div className="flex items-center gap-4">
            <img
              src="/koya/koya-sit-crop.webp"
              alt=""
              aria-hidden="true"
              // Кадр КОЯ вырезан со светлого фона: без рамки он читается как случайный
              // белый прямоугольник на тёмной панели. Оформляем как портрет.
              className="h-24 w-24 shrink-0 rounded-2xl object-cover ring-1 ring-white/15 shadow-lg sm:h-28 sm:w-28"
            />
            <div className="min-w-0">
              <p className="font-display text-xl font-extrabold leading-tight sm:text-2xl">
                Девять недель позади
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                Вы прошли весь сезон — от «Детектива КЦ» до «Альфа-марафона».
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl sf-1 px-2 py-2.5 text-center">
                <div className="font-display text-lg font-extrabold text-status-amber sm:text-xl">{s.value}</div>
                <div className="text-[11px] leading-tight text-ink-soft">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 pb-6 pt-1">
          <p className="text-sm leading-relaxed text-ink">
            Сотни клиентских ситуаций, споры с нами по эталонам — и не раз вы
            оказывались правы. <b>Тридцать шесть раз</b> команды закрывали неделю
            вообще без ошибок.
          </p>

          <p className="mt-3 text-sm leading-relaxed text-ink">
            Сейчас сверяем баллы за финальную игру и готовим награждение. Пока идёт
            подсчёт, итоговый рейтинг не публикуем — чтобы не пришлось его потом менять.
          </p>

          <p className="mt-3 rounded-2xl sf-1 px-4 py-3 text-xs leading-relaxed text-ink-soft">
            {PRIZES_NOTE}
          </p>

          <button
            onClick={close}
            className="btn-alfa mt-5 w-full rounded-2xl px-5 py-3 text-sm font-bold"
          >
            Спасибо за сезон 🎉
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/** Постоянная плашка на доске: окно закрывается навсегда, а вопрос «где итоги»
 *  остаётся, поэтому ответ должен висеть там, куда за итогами и приходят.
 *  Тон спокойнее, чем у окна: плашка висит долго и кричать ей нельзя. */
export function ResultsPendingBanner() {
  return (
    <div className="glass-strong relative mb-4 overflow-hidden rounded-glass p-4 sm:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-gold/15 blur-3xl"
      />
      <div className="relative flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gold/20 text-xl">
          🏆
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-base font-extrabold sm:text-lg">
            Сезон завершён — подводим итоги
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Семь игр за девять недель, 145 сданных работ. Баллы за финал сверяются,
            награждение готовится: итоговый рейтинг опубликуем, когда всё будет посчитано.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">{PRIZES_NOTE}</p>
        </div>
      </div>
    </div>
  )
}
