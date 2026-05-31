interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
}

const navItems = [
  { id: 'dashboard', name: '仪表盘', icon: '📊' },
  { id: 'elements', name: '元件管理', icon: '🔧' },
  { id: 'simulation', name: '仿真计算', icon: '⚡' },
  { id: 'results', name: '结果分析', icon: '📈' },
  { id: 'batch', name: '批量比对', icon: '📋' },
  { id: 'playback', name: '仿真回放', icon: '🎬' },
  { id: 'report', name: '报告生成', icon: '📄' },
];

function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-nav">
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="icon">{item.icon}</span>
            <span>{item.name}</span>
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <p className="text-small text-muted">版本 v2.0.0</p>
        <p className="text-small text-muted mt-1">精密仪器光路仿真系统</p>
      </div>
    </aside>
  );
}

export default Sidebar;
