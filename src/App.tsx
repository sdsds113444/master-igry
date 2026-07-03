import { lazy, Suspense, type ReactElement } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Loader from './components/Loader'
import { getSession } from './lib/db'

// Тяжёлые страницы грузятся по требованию — не тянем их в стартовый бандл.
const Board = lazy(() => import('./pages/Board'))
const TeamCabinet = lazy(() => import('./pages/TeamCabinet'))
const Admin = lazy(() => import('./pages/Admin'))
const Rules = lazy(() => import('./pages/Rules'))

function RequireSession({ children }: { children: ReactElement }) {
  return getSession() ? children : <Navigate to="/" replace />
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const ses = getSession()
  return ses && ses.role === 'admin' ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
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
  )
}
