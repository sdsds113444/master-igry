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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    } catch {
      /* localStorage может быть недоступен — не критично */
    }
  }, [dark])

  return (
    <button
      onClick={() => setDark((d) => !d)}
      aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={dark ? 'Светлая тема' : 'Тёмная тема'}
      className={`tap grid h-10 w-10 place-items-center rounded-full sf-1 text-ink-soft transition-colors sf-hover hover:text-alfa ${className}`}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
