import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDialogA11y } from '../lib/useDialogA11y'

/** Единая модалка: затемнение фона, пружинное появление, доступность
 *  (role=dialog, ловушка фокуса, Esc, блок скролла — через useDialogA11y),
 *  шапка с заголовком и кнопкой закрытия. Тело передаётся как children. */
export default function Dialog({
  open,
  onClose,
  ariaLabel,
  title,
  children,
  panelClassName = 'w-full max-w-md',
}: {
  open: boolean
  onClose: () => void
  /** Текстовое имя для скринридера (title может быть с иконкой). */
  ariaLabel: string
  title: ReactNode
  children: ReactNode
  panelClassName?: string
}) {
  const ref = useDialogA11y(open, onClose)
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={`glass-strong relative z-10 overflow-hidden rounded-glass ${panelClassName}`}
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 22 }}
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-3">
              <div className="flex min-w-0 items-center gap-2 text-base font-bold">{title}</div>
              <button
                onClick={onClose}
                aria-label="Закрыть"
                className="tap grid h-9 w-9 shrink-0 place-items-center rounded-full sf-1 text-ink-soft transition-colors sf-hover hover:text-alfa"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
