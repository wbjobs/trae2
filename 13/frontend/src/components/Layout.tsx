import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FlaskConical, 
  FolderOpen, 
  Users, 
  Building2, 
  Settings, 
  LogOut,
  Menu,
  X,
  FileText,
  History
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const menuItems = [
    { icon: LayoutDashboard, label: '仪表盘', path: '/' },
    { icon: FlaskConical, label: '标本管理', path: '/specimens' },
    { icon: FileText, label: '文件管理', path: '/files' },
    { icon: Users, label: '用户管理', path: '/admin/users', roles: ['admin'] },
    { icon: History, label: '操作日志', path: '/admin/logs', roles: ['admin'] },
    { icon: Building2, label: '部门管理', path: '/admin/departments', roles: ['admin', 'department_head'] },
    { icon: Settings, label: '系统设置', path: '/admin/settings', roles: ['admin'] }
  ];

  const hasAccess = (roles?: string[]) => {
    if (!roles || roles.length === 0) return true;
    return user ? roles.includes(user.role) : false;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <aside 
        className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-primary-500 text-white transition-all duration-300 flex flex-col`}
      >
        <div className="p-4 border-b border-primary-600 flex items-center justify-between">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <FlaskConical className="w-8 h-8" />
              <span className="font-bold text-lg">标本档案平台</span>
            </div>
          )}
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-primary-600 rounded-lg transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {menuItems.filter(item => hasAccess(item.roles)).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-primary-600 transition-colors group"
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-primary-600">
          {sidebarOpen && user && (
            <div className="mb-4">
              <div className="text-sm font-medium">{user.realName}</div>
              <div className="text-xs text-primary-200">{user.role}</div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-primary-600 transition-colors w-full"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">退出登录</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
};

export default Layout;
