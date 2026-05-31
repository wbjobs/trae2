import type { OpticalElement } from '../types';

interface DashboardProps {
  elements: OpticalElement[];
  onNavigate: (page: string) => void;
  isBackendConnected: boolean;
}

function Dashboard({ elements, onNavigate, isBackendConnected }: DashboardProps) {
  const quickTemplates = [
    {
      id: 'michelson',
      name: '迈克尔逊干涉仪',
      desc: '经典干涉测量系统',
      icon: '🔬',
    },
    {
      id: 'mach_zehnder',
      name: '马赫-曾德尔干涉仪',
      desc: '相移干涉测量系统',
      icon: '📐',
    },
    {
      id: 'young',
      name: '杨氏双缝实验',
      desc: '基础干涉演示系统',
      icon: '🎯',
    },
    {
      id: 'diffraction',
      name: '单缝衍射系统',
      desc: '衍射效应演示系统',
      icon: '💫',
    },
  ];

  const systemStats = [
    { label: '已配置元件', value: elements.length, icon: '🔧' },
    { label: '仿真模式', value: '5种', icon: '⚡' },
    { label: '支持元件', value: '10种', icon: '📦' },
    { label: '后端状态', value: isBackendConnected ? '正常' : '离线', icon: isBackendConnected ? '✅' : '❌' },
  ];

  return (
    <div>
      <h1 className="page-title">仪表盘</h1>

      <div className="grid-4 mb-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        {systemStats.map((stat) => (
          <div key={stat.label} className="card" style={{ marginBottom: 0 }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
              <div>
                <div className="result-value" style={{ fontSize: '1.25rem' }}>
                  {stat.value}
                </div>
                <div className="result-label">{stat.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">快速开始</h2>
        </div>
        <div className="template-grid">
          {quickTemplates.map((template) => (
            <div
              key={template.id}
              className="template-card"
              onClick={() => onNavigate('elements')}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{template.icon}</div>
              <div className="template-name">{template.name}</div>
              <div className="template-desc">{template.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">操作流程</h2>
          </div>
          <ol style={{ paddingLeft: '1.5rem' }}>
            <li className="mb-1">在「元件管理」中配置光学元件</li>
            <li className="mb-1">设置光源参数和仿真类型</li>
            <li className="mb-1">运行仿真计算</li>
            <li className="mb-1">查看结果分析</li>
            <li>生成调试报告</li>
          </ol>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">支持的光学元件</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {[
              '透镜',
              '反射镜',
              '分光镜',
              '光阑',
              '光栅',
              '棱镜',
              '滤光片',
              '波片',
              '探测器',
            ].map((elem) => (
              <span
                key={elem}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: 'var(--bg-primary)',
                  borderRadius: '9999px',
                  fontSize: '0.875rem',
                }}
              >
                {elem}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
