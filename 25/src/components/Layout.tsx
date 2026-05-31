import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const getPageTitle = () => {
    switch (true) {
      case location.pathname.startsWith('/annotate'):
        return '图片标注'
      case location.pathname === '/dashboard':
        return '项目总览'
      case location.pathname === '/reviews':
        return '审核记录'
      case location.pathname === '/versions':
        return '版本对比'
      case location.pathname === '/users':
        return '用户管理'
      default:
        return '古籍拓片数字化勘校平台'
    }
  }

  return (
    <div className="min-h-screen bg-rice">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 bg-rice-100 border-b border-ink-100 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 hover:bg-ink-100 rounded-lg"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5 text-ink" />
              </button>
              <h1 className="chinese-title text-xl font-bold text-ink">
                {getPageTitle()}
              </h1>
            </div>
          </div>
        </header>

        <main className="p-4 md:p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}