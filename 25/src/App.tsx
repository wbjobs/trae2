import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Login from '@/pages/Login'
import Register from '@/pages/Register'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Annotate = lazy(() => import('@/pages/Annotate'))
const Reviews = lazy(() => import('@/pages/Reviews'))
const Versions = lazy(() => import('@/pages/Versions'))
const UserManagement = lazy(() => import('@/pages/UserManagement'))

const LoadingFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-ink-200 border-t-ink rounded-full animate-spin" />
  </div>
)

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/annotate/:projectId"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <Annotate />
              </Suspense>
            }
          />
          <Route
            path="/annotate/:projectId/:imageId"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <Annotate />
              </Suspense>
            }
          />
          <Route
            path="/reviews"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <Reviews />
              </Suspense>
            }
          />
          <Route
            path="/versions"
            element={
              <Suspense fallback={<LoadingFallback />}>
                <Versions />
              </Suspense>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute roles={['admin']}>
                <Suspense fallback={<LoadingFallback />}>
                  <UserManagement />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}