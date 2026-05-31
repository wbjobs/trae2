import { useState, useEffect } from 'react';
import { Header } from '../components/ui/Header';
import { useBridgeStore } from '../store/useBridgeStore';
import { Search, Filter, Download, Plus, Trash2, Edit, AlertTriangle, Calendar, MapPin } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { defectTypeLabels, severityLabels, severityColors } from '../utils/stressColors';

export default function DataManagement() {
  const { loadBridges, bridges, defects, currentBridge, selectBridge, removeDefect } = useBridgeStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');

  useEffect(() => {
    loadBridges();
  }, [loadBridges]);

  useEffect(() => {
    if (bridges.length > 0 && !currentBridge) {
      selectBridge(bridges[0]);
    }
  }, [bridges, currentBridge, selectBridge]);

  const filteredDefects = defects.filter((d) => {
    const matchesSearch = d.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || d.type === filterType;
    const matchesSeverity = filterSeverity === 'all' || d.severity === filterSeverity;
    return matchesSearch && matchesType && matchesSeverity;
  });

  const defectTypeStats = Object.entries(defectTypeLabels).map(([key, label]) => ({
    name: label,
    value: defects.filter((d) => d.type === key).length,
    color: severityColors.high,
  })).filter((d) => d.value > 0);

  const severityStats = Object.entries(severityLabels).map(([key, label]) => ({
    name: label,
    value: defects.filter((d) => d.severity === key).length,
    color: severityColors[key],
  })).filter((d) => d.value > 0);

  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const month = new Date();
    month.setMonth(month.getMonth() - 5 + i);
    return {
      name: month.toLocaleDateString('zh-CN', { month: 'short' }),
      裂纹: Math.floor(Math.random() * 10) + 2,
      腐蚀: Math.floor(Math.random() * 8) + 1,
      变形: Math.floor(Math.random() * 5),
      剥落: Math.floor(Math.random() * 6) + 1,
    };
  });

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此病害记录吗？')) {
      await removeDefect(id);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 overflow-hidden">
      <Header />
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">检测数据管理</h1>
              <p className="text-slate-400 text-sm mt-1">
                管理桥梁病害检测数据，共 {defects.length} 条记录
              </p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors">
              <Download className="w-4 h-4" />
              导出报告
            </button>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">病害总数</p>
                  <p className="text-3xl font-bold text-slate-100 mt-1">{defects.length}</p>
                </div>
                <div className="w-12 h-12 bg-sky-600/20 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-sky-400" />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">危急</p>
                  <p className="text-3xl font-bold text-red-400 mt-1">
                    {defects.filter((d) => d.severity === 'critical').length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-red-600/20 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">严重</p>
                  <p className="text-3xl font-bold text-orange-400 mt-1">
                    {defects.filter((d) => d.severity === 'high').length}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-600/20 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-orange-400" />
                </div>
              </div>
            </div>
            
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">本月新增</p>
                  <p className="text-3xl font-bold text-emerald-400 mt-1">
                    {Math.floor(defects.length * 0.3)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-emerald-600/20 rounded-xl flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-4">病害类型分布</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={defectTypeStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {defectTypeStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value: string) => <span className="text-slate-400 text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-4">严重程度分布</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={severityStats}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {severityStats.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value: string) => <span className="text-slate-400 text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-4">月度检测趋势</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#64748B" fontSize={10} />
                    <YAxis stroke="#64748B" fontSize={10} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1E293B',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="裂纹" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="腐蚀" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="变形" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="剥落" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="font-medium text-slate-100">病害记录列表</h3>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="搜索病害..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="all">全部类型</option>
                  {Object.entries(defectTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="all">全部等级</option>
                  {Object.entries(severityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">类型</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">等级</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">位置</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">描述</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">检测时间</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {filteredDefects.map((defect, index) => (
                    <tr key={defect.id} className={`hover:bg-slate-700/30 transition-colors ${index % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                      <td className="px-4 py-3 text-sm font-mono text-slate-300">{defect.id}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-slate-700 text-slate-200 text-xs rounded">
                          {defectTypeLabels[defect.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="px-2 py-1 text-xs rounded font-medium"
                          style={{ backgroundColor: `${severityColors[defect.severity]}20`, color: severityColors[defect.severity] }}
                        >
                          {severityLabels[defect.severity]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400 font-mono">
                        ({defect.position.x.toFixed(1)}, {defect.position.y.toFixed(1)}, {defect.position.z.toFixed(1)})
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300 max-w-xs truncate">{defect.description}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {new Date(defect.detectedAt).toLocaleDateString('zh-CN')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-slate-700 rounded transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(defect.id)}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredDefects.length === 0 && (
              <div className="p-12 text-center">
                <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">没有找到匹配的病害记录</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
