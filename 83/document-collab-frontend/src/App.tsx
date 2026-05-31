import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/useAuthStore'
import AppLayout from './components/Layout/AppLayout'
import Login from './pages/Login'
import Workspace from './pages/Workspace'
import DocumentEdit from './pages/DocumentEdit'
import VersionHistory from './pages/VersionHistory'
import AuditLog from './pages/AuditLog'
import { useEffect } from 'react'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function App() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage)
  useEffect(() => {
    loadFromStorage()
  }, [loadFromStorage])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/workspace" replace />} />
        <Route path="workspace" element={<Workspace />} />
        <Route path="documents/:id/edit" element={<DocumentEdit />} />
        <Route path="documents/:id/versions" element={<VersionHistory />} />
        <Route path="audit-logs" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
