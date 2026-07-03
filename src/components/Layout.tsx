import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, ShieldCheck, LogOut, BookOpen } from 'lucide-react'
import Background from './Background'
import ThemeToggle from './ThemeToggle'
import { getSession, signOut } from '../lib/db'
import { teamAvatar } from '../lib/ui'

const linkBase =
  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors'

export default function Layout() {
  const navigate = useNavigate()
  const session = getSession()

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
          <div className="flex items-center gap-2.5 pl-1 sm:pr-3">
            <img src="/koya-favicon.svg" alt="КОЯ" className="h-9 w-9 drop-shadow" />
            <div className="hidden leading-tight sm:block">
              <div className="text-base font-bold tracking-tight">
                Герои на линии
              </div>
              <div className="text-xs font-semibold text-ink-soft">Альфа · КЦ</div>
            </div>
          </div>

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
                  <LayoutDashboard size={16} /> <span className="hidden md:inline">Доска</span>
                </NavLink>
                <NavLink
                  to="/team"
                  aria-label="Кабинет команды"
                  className={({ isActive }) =>
                    `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink sf-hoversoft'}`
                  }
                >
                  <Users size={16} /> <span className="hidden md:inline">Кабинет&nbsp;команды</span>
                </NavLink>
                <NavLink
                  to="/rules"
                  aria-label="Правила"
                  className={({ isActive }) =>
                    `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink sf-hoversoft'}`
                  }
                >
                  <BookOpen size={16} /> <span className="hidden md:inline">Правила</span>
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
                <ShieldCheck size={16} /> <span className="hidden md:inline">Админ</span>
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
              className="grid h-10 w-10 place-items-center rounded-full sf-1 text-ink-soft transition-colors sf-hover hover:text-alfa"
            >
              <LogOut size={18} />
            </button>
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <Outlet />
      </main>
    </div>
  )
}
