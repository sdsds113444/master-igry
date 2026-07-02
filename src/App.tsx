import type { ReactElement } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Board from './pages/Board'
import TeamCabinet from './pages/TeamCabinet'
import Admin from './pages/Admin'
import Rules from './pages/Rules'
import { getSession } from './lib/db'

function RequireSession({ children }: { children: ReactElement }) {
  return getSession() ? children : <Navigate to="/" replace />
}

function RequireAdmin({ children }: { children: ReactElement }) {
  const ses = getSession()
  return ses && ses.role === 'admin' ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
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
  )
}
