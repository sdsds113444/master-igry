import { useEffect, useRef } from 'react'

/** Доступность модального окна одним хуком (WCAG 2.1.2 / 2.4.3 / 4.1.2):
 *  – закрытие по Escape;
 *  – ловушка фокуса (Tab не уходит за пределы диалога);
 *  – перевод фокуса внутрь при открытии и возврат на триггер при закрытии;
 *  – блокировка прокрутки фона.
 *  Возвращает ref, который нужно повесить на контейнер диалога. */
export function useDialogA11y(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const node = ref.current
    const prevActive = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = (): HTMLElement[] => {
      if (!node) return []
      return Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement)
    }

    // фокус внутрь диалога при открытии
    const first = focusables()[0]
    ;(first ?? node)?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const f = focusables()
        if (f.length === 0) {
          e.preventDefault()
          return
        }
        const firstEl = f[0]
        const lastEl = f[f.length - 1]
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      prevActive?.focus?.()
    }
  }, [open, onClose])

  return ref
}
