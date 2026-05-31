import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { checkServiceHealth } from '../api/index.js'

// 侧边栏导航项配置
const navItems = [
  { path: '/overview', label: '全网态势', icon: '📡' },
  { path: '/signaling', label: '信令监控', icon: '📶' },
  { path: '/link-analysis', label: '链路分析', icon: '🔗' },
  { path: '/station-sync', label: '节点同步', icon: '🚉' },
  { path: '/audit-log', label: '审计日志', icon: '📋' }
]

// 布局组件 - 侧边栏 + 顶栏 + 主内容区
export default function Layout() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [services, setServices] = useState([])
  const location = useLocation()

  // 实时时钟更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 定时检查各服务健康状态
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const data = await checkServiceHealth()
        setServices(data)
      } catch {
        setServices([
          { name: '信令服务', status: '异常' },
          { name: '链路分析', status: '异常' },
          { name: '节点同步', status: '异常' },
          { name: '审计日志', status: '异常' }
        ])
      }
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  // 格式化日期时间
  const formatDate = (date) => {
    const pad = (n) => String(n).padStart(2, '0')
    const y = date.getFullYear()
    const m = pad(date.getMonth() + 1)
    const d = pad(date.getDate())
    const h = pad(date.getHours())
    const min = pad(date.getMinutes())
    const s = pad(date.getSeconds())
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    return {
      date: `${y}-${m}-${d}`,
      time: `${h}:${min}:${s}`,
      weekday: `星期${weekdays[date.getDay()]}`
    }
  }

  const timeInfo = formatDate(currentTime)

  // 获取当前页面标题
  const currentTitle = navItems.find(item => location.pathname.startsWith(item.path))?.label || '系统概览'

  return (
    <div className="layout">
      {/* 左侧导航栏 */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">🚇</div>
          <div className="logo-text">
            <div className="logo-title">信号态势</div>
            <div className="logo-sub">SIGNAL DASHBOARD</div>
          </div>
        </div>

        <nav className="nav-menu">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="system-info">
            <div className="info-row">
              <span className="info-label">系统版本</span>
              <span className="info-value">v1.0.0</span>
            </div>
            <div className="info-row">
              <span className="info-label">运行时长</span>
              <span className="info-value">128天</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 右侧主体区域 */}
      <div className="main-wrapper">
        {/* 顶部状态栏 */}
        <header className="header">
          <div className="header-left">
            <h1 className="page-title">{currentTitle}</h1>
            <div className="page-breadcrumb">
              <span>地铁信号系统</span>
              <span className="separator">›</span>
              <span>{currentTitle}</span>
            </div>
          </div>

          <div className="header-right">
            {/* 服务状态指示灯 */}
            <div className="service-status">
              {services.map((svc, idx) => (
                <div key={idx} className={`status-item ${svc.status === '正常' ? 'ok' : 'error'}`}>
                  <span className="status-dot" />
                  <span className="status-text">{svc.name}</span>
                </div>
              ))}
            </div>

            {/* 时钟区域 */}
            <div className="clock-area">
              <div className="clock-date">{timeInfo.date}</div>
              <div className="clock-time">{timeInfo.time}</div>
              <div className="clock-weekday">{timeInfo.weekday}</div>
            </div>
          </div>
        </header>

        {/* 主内容区 */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}