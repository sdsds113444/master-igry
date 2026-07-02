import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, ShieldCheck, LogOut } from 'lucide-react'
import Background from './Background'
import { TEAMS, MY_TEAM_CODE } from '../data/mock'

const linkBase =
  'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors'

export default function Layout() {
  const navigate = useNavigate()
  const myTeam = TEAMS.find((t) => t.code === MY_TEAM_CODE)

  return (
    <div className="min-h-full">
      <Background />

      {/* Верхняя навигация */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <nav className="glass-strong mx-auto flex max-w-6xl items-center gap-3 rounded-full px-3 py-2">
          <div className="flex items-center gap-2.5 pl-1 sm:pr-3">
            <img src="/koya-favicon.svg" alt="КОЯ" className="h-9 w-9 drop-shadow" />
            <div className="hidden leading-tight sm:block">
              <div className="font-display text-[15px] font-extrabold tracking-tight">
                Мастер игры
              </div>
              <div className="text-[11px] font-semibold text-ink-soft">Альфа · КЦ</div>
            </div>
          </div>

          <div className="mx-auto flex items-center gap-1">
            <NavLink
              to="/board"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink hover:bg-white/60'}`
              }
            >
              <LayoutDashboard size={16} /> <span className="hidden md:inline">Доска</span>
            </NavLink>
            <NavLink
              to="/team"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink hover:bg-white/60'}`
              }
            >
              <Users size={16} /> <span className="hidden md:inline">Кабинет&nbsp;команды</span>
            </NavLink>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? 'bg-alfa text-white shadow' : 'text-ink hover:bg-white/60'}`
              }
            >
              <ShieldCheck size={16} /> <span className="hidden md:inline">Админ</span>
            </NavLink>
          </div>

          <div className="flex items-center gap-2 pr-1">
            {myTeam && (
              <div className="hidden items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 sm:flex">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full text-xs font-extrabold text-white"
                  style={{ background: `hsl(${myTeam.hue} 70% 55%)` }}
                >
                  {myTeam.name.slice(0, 1)}
                </span>
                <div className="leading-tight">
                  <div className="text-[12px] font-bold">{myTeam.name}</div>
                  <div className="text-[10px] font-semibold text-ink-soft">{myTeam.code}</div>
                </div>
              </div>
            )}
            <button
              onClick={() => navigate('/')}
              title="Выйти"
              className="grid h-9 w-9 place-items-center rounded-full bg-white/60 text-ink-soft transition-colors hover:bg-white hover:text-alfa"
            >
              <LogOut size={17} />
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <Outlet />
      </main>
    </div>
  )
}
