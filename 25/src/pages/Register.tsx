import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { User, Lock, Mail, BookOpen, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    if (password !== confirmPassword) {
      return
    }

    try {
      await register({ username, email, password })
      navigate('/login', { state: { registered: true } })
    } catch {
      // error handled in store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center rice-paper p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-ink rounded-xl mb-4 shadow-lg">
            <BookOpen className="w-9 h-9 text-rice" />
          </div>
          <h1 className="chinese-title text-3xl font-bold text-ink mb-2">
            创建账户
          </h1>
          <p className="text-ink-400">加入古籍拓片数字化勘校平台</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              用户名
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-ink pl-10"
                placeholder="请输入用户名"
                required
                minLength={3}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              邮箱
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-ink pl-10"
                placeholder="请输入邮箱"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-ink pl-10 pr-10"
                placeholder="请输入密码"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-2">
              确认密码
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-300" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-ink pl-10"
                placeholder="请再次输入密码"
                required
              />
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-1 text-xs text-cinnabar">两次输入的密码不一致</p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-cinnabar-50 border border-cinnabar-200 rounded-lg text-sm text-cinnabar animate-fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (password !== confirmPassword && confirmPassword.length > 0)}
            className="w-full btn-ink py-3 text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-ink-400">
          已有账户？{' '}
          <Link to="/login" className="text-cinnabar hover:underline font-medium">
            立即登录
          </Link>
        </p>
      </div>
    </div>
  )
}
