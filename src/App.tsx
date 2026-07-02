import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Board from './pages/Board'
import TeamCabinet from './pages/TeamCabinet'
import Admin from './pages/Admin'
import Rules from './pages/Rules'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/board" element={<Board />} />
        <Route path="/team" element={<TeamCabinet />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
