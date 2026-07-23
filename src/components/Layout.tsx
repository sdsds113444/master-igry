import { useEffect, useState } from 'react'
import { NavLink, Link, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, ShieldCheck, LogOut, BookOpen, MessageSquarePlus } from 'lucide-react'
import Background from './Background'
import ThemeToggle from './ThemeToggle'
import FeedbackModal from './FeedbackModal'
import DeadlineBanner from './DeadlineBanner'
import { getSession, signOut, getGames, pickCurrentGame, getSubmission } from '../lib/db'
import { teamAvatar } from '../lib/ui'

const linkBase =
  'tap flex items-center justify-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors'

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

  // Дедлайн активного задания + сдала ли уже эта команда — для плашки обратного отсчёта.
  // Layout живёт всю сессию (страницы меняются внутри Outlet), поэтому запрос идёт один
  // раз, плюс обновление при возврате на вкладку (чтобы плашка пропала после сдачи).
  const teamId = session?.teamId ?? null
  const role = session?.role
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (role === 'admin' || !teamId) return
    let stopped = false
    async function load() {
      try {
        const cur = pickCurrentGame(await getGames())
        if (stopped) return
        setDeadlineAt(cur?.deadline_at ?? null)
        if (!cur) return
        const sub = await getSubmission(teamId!, cur.id)
        if (stopped) return
        setSubmitted(!!sub && (sub.answer.trim().length > 0 || !!sub.fileName))
      } catch { /* тихо: плашка не критична, без неё сайт работает как прежде */ }
    }
    load()
    window.addEventListener('focus', load)
    return () => { stopped = true; window.removeEventListener('focus', load) }
  }, [teamId, role])

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const avatar = session ? teamAvatar(session.hue) : null

  return (
    <div className="min-h-full">
      <a href="#main" className="skip-link">Перейти к содержимому</a>
      <Background />

      {/* Верхняя навигация */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <nav className="glass-strong mx-auto flex max-w-6xl items-center gap-3 rounded-full px-3 py-2">
          <Link
            to={session?.role === 'admin' ? '/admin' : '/board'}
            aria-label="На главную"
            className="flex items-center gap-2.5 rounded-full pl-1 transition-opacity hover:opacity-80 sm:pr-3"
          >
            <img src="/koya-favicon.svg" alt="КОЯ" className="h-9 w-9 drop-shadow" />
            <div className="hidden leading-tight sm:block">
              <div className="text-base font-bold tracking-tight">
                Мастера игры
              </div>
              <div className="text-xs font-semibold text-ink-soft">Альфа · КЦ</div>
            </div>
          </Link>

          <div className="mx-auto flex items-center gap-1">
            {session?.role !== 'admin' && (
              <>
                <NavLink
                  to="/board"
                  aria-label="Доска"
                  className={({ isActive }) =>
                    `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink sf-hoversoft'}`
                  }
                >
                  <LayoutDashboard size={16} /> <span className="hidden lg:inline">Доска</span>
                </NavLink>
                <NavLink
                  to="/team"
                  aria-label="Кабинет команды"
                  className={({ isActive }) =>
                    `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink sf-hoversoft'}`
                  }
                >
                  <Users size={16} /> <span className="hidden lg:inline">Кабинет&nbsp;команды</span>
                </NavLink>
                <NavLink
                  to="/rules"
                  aria-label="Правила"
                  className={({ isActive }) =>
                    `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink sf-hoversoft'}`
                  }
                >
                  <BookOpen size={16} /> <span className="hidden lg:inline">Правила</span>
                </NavLink>
              </>
            )}
            {session?.role === 'admin' && (
              <NavLink
                to="/admin"
                aria-label="Админ"
                className={({ isActive }) =>
                  `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink sf-hoversoft'}`
                }
              >
                <ShieldCheck size={16} /> <span className="hidden lg:inline">Админ</span>
              </NavLink>
            )}
          </div>

          <div className="flex items-center gap-2 pr-1">
            <ThemeToggle />
            {session && session.role !== 'admin' && avatar && (
              <div className="hidden items-center gap-2 rounded-full sf-1 px-3 py-1.5 sm:flex">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-xs font-extrabold"
                  style={{ background: avatar.bg, color: avatar.fg }}
                >
                  {session.name.slice(0, 1)}
                </span>
                <div className="leading-tight">
                  <div className="text-xs font-bold">{session.name}</div>
                  <div className="text-xs font-semibold text-ink-soft">{session.code}</div>
                </div>
              </div>
            )}
            <button
              onClick={handleSignOut}
              aria-label="Выйти"
              title="Выйти"
              className="tap grid h-10 w-10 place-items-center rounded-full sf-1 text-ink-soft transition-colors sf-hover hover:text-alfa"
            >
              <LogOut size={18} />
            </button>
          </div>
        </nav>
      </header>

      {/* Дедлайн задания: видна на всех страницах, пока команда не сдала. */}
      <div className="px-4 pt-3">
        <DeadlineBanner deadlineAt={deadlineAt} submitted={submitted} />
      </div>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <Outlet />
      </main>

      {/* Плавающая кнопка обратной связи — доступна с любой страницы. */}
      <button
        onClick={() => setFeedbackOpen(true)}
        aria-label="Оставить отзыв"
        title="Оставить отзыв"
        className="btn-alfa fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-lg"
      >
        <MessageSquarePlus size={18} /> <span className="hidden sm:inline">Отзыв</span>
      </button>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  )
}
