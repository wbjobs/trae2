import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import type { UserRole } from '@/lib/types'

export default function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode
  roles?: UserRole[]
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const user = useAuthStore((s) => s.user)
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const location = useLocation()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const verify = async () => {
      if (isAuthenticated && !user) {
        await checkAuth()
      }
      setChecking(false)
    }
    verify()
  }, [isAuthenticated, user, checkAuth])

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-rice">
        <div className="w-12 h-12 border-4 border-ink-200 border-t-cinnabar rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}