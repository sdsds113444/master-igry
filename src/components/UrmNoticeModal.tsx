import { useEffect, useState } from 'react'
import { MonitorSmartphone, Smartphone, Home } from 'lucide-react'
import Dialog from './Dialog'

/** Флаг «предупреждение про УРМ уже показывали на этом устройстве». Экспортируем ключ,
 *  чтобы модалка дедлайна (Layout) не выскакивала одновременно на самом первом заходе. */
export const URM_SEEN_KEY = 'mi.urmNoticeSeen'

/** Одноразовое (на устройство) окно: на рабочем компьютере (УРМ) сайт из-за ограничений
 *  банковской сети может работать нестабильно; при ошибках — зайти с телефона/из дома.
 *  Показывается ГЛОБАЛЬНО (App), чтобы застать и тех, кто уже вошёл и страницу входа
 *  с постоянной плашкой не видит. Постоянное напоминание — плашка на странице входа. */
export default function UrmNoticeModal() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try { if (!localStorage.getItem(URM_SEEN_KEY)) setOpen(true) } catch { /* приватный режим — просто не показываем */ }
  }, [])
  function close() {
    try { localStorage.setItem(URM_SEEN_KEY, '1') } catch { /* приватный режим: покажем ещё раз в следующий раз, не критично */ }
    setOpen(false)
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      ariaLabel="Если сайт нестабильно работает на рабочем компьютере"
      title={<><MonitorSmartphone size={18} className="shrink-0 text-alfa" /> Если сайт глючит на работе</>}
      panelClassName="w-full max-w-md"
    >
      <div className="px-6 pb-6 pt-1">
        <p className="text-sm leading-relaxed text-ink">
          На рабочем компьютере (<b>УРМ</b>) из-за ограничений банковской сети сайт иногда
          работает нестабильно: код не проходит, страница не грузится, ответ или сообщение
          не отправляется.
        </p>
        <p className="mt-3 text-sm font-semibold text-ink">Если поймали такую ошибку:</p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2.5 rounded-2xl sf-1 px-3 py-2.5 text-sm">
            <Smartphone size={18} className="shrink-0 text-alfa" />
            <span>Зайдите <b>с телефона</b> по мобильному интернету (не по рабочему Wi-Fi)</span>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl sf-1 px-3 py-2.5 text-sm">
            <Home size={18} className="shrink-0 text-alfa" />
            <span>Или <b>с домашнего компьютера</b></span>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-soft">Там всё работает стабильно.</p>
        <button onClick={close} className="btn-alfa mt-5 w-full rounded-2xl px-5 py-3 text-sm font-bold">
          Понятно
        </button>
      </div>
    </Dialog>
  )
}
