import { Suspense, useEffect, type ReactElement } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Loader from './components/Loader'
import UrmNoticeModal from './components/UrmNoticeModal'
import { getSession, reconcileSession } from './lib/db'
import { initPing } from './lib/ping'
import { lazyPage } from './lib/lazyPage'

// Тяжёлые страницы грузятся по требованию — не тянем их в стартовый бандл.
// lazyPage вместо lazy: после деплоя старые чанки исчезают, и вкладка, открытая ДО
// выкатки, падала на их загрузке с экраном «Что-то пошло не так». Теперь такая вкладка
// один раз молча перезагружается и получает актуальные файлы.
const Board = lazyPage(() => import('./pages/Board'))
const TeamCabinet = lazyPage(() => import('./pages/TeamCabinet'))
const Admin = lazyPage(() => import('./pages/Admin'))
const Rules = lazyPage(() => import('./pages/Rules'))

function RequireSession({ children }: { children: ReactElement }) {
  return getSession() ? children : <Navigate to="/" replace />
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const ses = getSession()
  return ses && ses.role === 'admin' ? children : <Navigate to="/" replace />
}

export default function App() {
  const navigate = useNavigate()

  // Разблокировка звука уведомлений на первом жесте пользователя (правило браузера:
  // без взаимодействия со страницей звук не играет).
  useEffect(() => { initPing() }, [])

  // Если анонимная auth-сессия истекла/пропала, а локальная «висит» — разлогиниваем,
  // чтобы не застрять залогиненным с пустыми данными (RLS вернёт пусто).
  useEffect(() => {
    reconcileSession().then((cleared) => {
      if (cleared) navigate('/', { replace: true })
    })
  }, [navigate])

  return (
    <>
      {/* Глобально: одноразовое предупреждение про нестабильность на рабочем УРМ.
          Показывается поверх любой страницы, чтобы застать и уже вошедшие команды. */}
      <UrmNoticeModal />
      <Suspense fallback={<Loader minH="100vh" />}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route element={<RequireSession><Layout /></RequireSession>}>
            <Route path="/board" element={<Board />} />
            <Route path="/team" element={<TeamCabinet />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
