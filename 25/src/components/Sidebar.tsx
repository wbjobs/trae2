import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Image,
  ClipboardCheck,
  GitCompare,
  Users,
  BookOpen,
  LogOut,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import type { UserRole } from '@/lib/types'

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: '项目总览' },
  { path: '/annotate', icon: Image, label: '图片标注' },
  { path: '/reviews', icon: ClipboardCheck, label: '审核记录' },
  { path: '/versions', icon: GitCompare, label: '版本对比' },
]

const adminItems = [{ path: '/users', icon: Users, label: '用户管理' }]

const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  annotator: '标注员',
  reviewer: '审核员',
  viewer: '查看者',
}

export default function Sidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const isActive = (path: string) => {
    if (path === '/annotate') {
      return location.pathname.startsWith('/annotate')
    }
    return location.pathname === path
  }

  const handleLogout = () => {
    logout()
    onClose()
  }

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-ink-700/50 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-ink text-rice z-40 transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-ink-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-cinnabar rounded-lg flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-rice" />
                </div>
                <div>
                  <h1 className="chinese-title font-bold text-lg">古籍拓片</h1>
                  <p className="text-xs text-ink-300">数字化勘校平台</p>
                </div>
              </div>
              <button
                className="lg:hidden p-1 hover:bg-ink-700 rounded"
                onClick={onClose}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                  isActive(item.path)
                    ? 'bg-cinnabar text-rice shadow-md'
                    : 'hover:bg-ink-700 text-ink-200 hover:text-rice'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
                {isActive(item.path) && (
                  <ChevronRight className="w-4 h-4 ml-auto" />
                )}
              </Link>
            ))}

            {user?.role === 'admin' && (
              <>
                <div className="mt-4 pt-4 border-t border-ink-700">
                  <p className="text-xs text-ink-400 px-3 mb-2 uppercase tracking-wider">
                    管理
                  </p>
                  {adminItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
                        isActive(item.path)
                          ? 'bg-cinnabar text-rice shadow-md'
                          : 'hover:bg-ink-700 text-ink-200 hover:text-rice'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </nav>

          <div className="p-4 border-t border-ink-700">
            {user && (
              <div className="mb-3 px-3">
                <p className="text-sm font-medium text-rice">
                  {user.username}
                </p>
                <p className="text-xs text-ink-400">
                  {roleLabels[user.role]}
                </p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-ink-700 text-ink-200 hover:text-rice transition-all duration-200"
            >
              <LogOut className="w-5 h-5" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
