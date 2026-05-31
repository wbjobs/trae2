import { useState, useEffect } from 'react';
import { FlaskConical, Users, FileText, Clock, TrendingUp, ArrowRight, Activity } from 'lucide-react';
import { specimenService, userService } from '../services';
import { useAuthStore } from '../stores/authStore';

const DashboardPage = () => {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    totalSpecimens: 0,
    totalUsers: 0,
    totalFiles: 0,
    recentEdits: 0
  });
  const [recentSpecimens, setRecentSpecimens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [specimensResponse, usersResponse]: any[] = await Promise.all([
        specimenService.list({ pageSize: 5 }),
        userService.list({ pageSize: 1 })
      ]);

      if (specimensResponse.success) {
        setStats(prev => ({
          ...prev,
          totalSpecimens: specimensResponse.pagination?.total || 0,
          recentEdits: specimensResponse.data?.length || 0
        }));
        setRecentSpecimens(specimensResponse.data || []);
      }

      if (usersResponse.success) {
        setStats(prev => ({
          ...prev,
          totalUsers: usersResponse.pagination?.total || 0
        }));
      }
    } catch (error) {
      console.error('加载仪表盘数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    { label: '标本总数', value: stats.totalSpecimens, icon: FlaskConical, color: 'bg-primary-100 text-primary-500' },
    { label: '用户总数', value: stats.totalUsers, icon: Users, color: 'bg-green-100 text-green-600' },
    { label: '文件总数', value: stats.totalFiles, icon: FileText, color: 'bg-accent-100 text-accent-500' },
    { label: '近期编辑', value: stats.recentEdits, icon: Activity, color: 'bg-blue-100 text-blue-600' }
  ];

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-slate-400">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">欢迎回来，{user?.realName}</h1>
        <p className="text-slate-500 mt-1">今天是 {new Date().toLocaleDateString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card, index) => (
          <div key={index} className="card p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">{card.label}</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{card.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${card.color}`}>
                <card.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-800">最近编辑的标本</h2>
            <button className="text-sm text-primary-500 hover:text-primary-600 flex items-center gap-1">
              查看全部 <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4">
            {recentSpecimens.length === 0 ? (
              <div className="text-center py-8 text-slate-400">暂无数据</div>
            ) : (
              recentSpecimens.map((specimen: any) => (
                <div 
                  key={specimen.id} 
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                      <FlaskConical className="w-5 h-5 text-primary-500" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">{specimen.name}</p>
                      <p className="text-sm text-slate-500">{specimen.specimenNo} · {specimen.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500">
                      {new Date(specimen.updatedAt).toLocaleDateString('zh-CN')}
                    </p>
                    <span className={`inline-block px-2 py-1 rounded-full text-xs mt-1 ${
                      specimen.status === 'published' ? 'bg-green-100 text-green-700' :
                      specimen.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {specimen.status === 'published' ? '已发布' : specimen.status === 'draft' ? '草稿' : '已归档'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-6">快捷操作</h2>
          <div className="space-y-3">
            <button className="w-full p-4 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-left flex items-center gap-3">
              <FlaskConical className="w-5 h-5" />
              <span>新建标本档案</span>
            </button>
            <button className="w-full p-4 bg-accent-50 text-accent-700 rounded-lg hover:bg-accent-100 transition-colors text-left flex items-center gap-3">
              <TrendingUp className="w-5 h-5" />
              <span>查看统计报表</span>
            </button>
            <button className="w-full p-4 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-left flex items-center gap-3">
              <Clock className="w-5 h-5" />
              <span>最近操作记录</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
