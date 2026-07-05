import { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

/** Переключатель светлой/тёмной темы. Начальное состояние берётся из класса
 *  .dark на <html> (его ставит инлайн-скрипт в index.html до рендера — без мигания),
 *  а выбор сохраняется в localStorage. */
function isDarkNow(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [dark, setDark] = useState(isDarkNow)

  // Только применяем класс. В localStorage НЕ пишем в эффекте — иначе при первом
  // визите системная тема сразу сохранялась бы как «выбор пользователя», и
  // public/theme.js навсегда игнорировал бы смену системной темы. Запись — по клику.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  function toggle() {
    setDark((d) => {
      const next = !d
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light')
      } catch {
        /* localStorage может быть недоступен — не критично */
      }
      return next
    })
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      className={`tap grid h-10 w-10 place-items-center rounded-full sf-1 text-ink-soft transition-colors sf-hover hover:text-alfa ${className}`}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
