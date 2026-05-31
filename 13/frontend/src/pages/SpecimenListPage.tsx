import { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  Filter, 
  Plus, 
  FlaskConical, 
  ChevronLeft, 
  ChevronRight, 
  Eye,
  Edit3,
  Trash2,
  MoreVertical
} from 'lucide-react';
import { specimenService } from '../services';
import { Specimen } from '@shared/types';
import { useDebounce } from '../hooks/useDebounce';

const SpecimenRow = memo(({ 
  specimen, 
  onView, 
  onEdit, 
  onDelete 
}: { 
  specimen: Specimen; 
  onView: (id: string) => void; 
  onEdit: (id: string) => void; 
  onDelete: (id: string) => void;
}) => (
  <tr className="hover:bg-slate-50">
    <td className="px-6 py-4 text-sm font-mono text-slate-600">{specimen.specimenNo}</td>
    <td className="px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
          <FlaskConical className="w-4 h-4 text-primary-500" />
        </div>
        <span className="font-medium text-slate-800">{specimen.name}</span>
      </div>
    </td>
    <td className="px-6 py-4 text-sm text-slate-500 italic">{specimen.scientificName || '-'}</td>
    <td className="px-6 py-4 text-sm text-slate-600">{specimen.category}</td>
    <td className="px-6 py-4">
      <span className={`badge ${
        specimen.status === 'published' ? 'bg-green-100 text-green-700' :
        specimen.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
        'bg-slate-100 text-slate-600'
    }`}>
        {specimen.status === 'published' ? '已发布' : specimen.status === 'draft' ? '草稿' : '已归档'}
      </span>
    </td>
    <td className="px-6 py-4 text-sm text-slate-500">
      {new Date(specimen.updatedAt).toLocaleDateString('zh-CN')}
    </td>
    <td className="px-6 py-4">
      <div className="flex items-center justify-end gap-2">
        <button 
          onClick={() => onView(specimen.id)}
          className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
          title="查看"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onEdit(specimen.id)}
          className="p-2 text-slate-400 hover:text-accent-500 hover:bg-accent-50 rounded-lg transition-colors"
          title="编辑"
        >
          <Edit3 className="w-4 h-4" />
        </button>
        <button 
          onClick={() => onDelete(specimen.id)}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          title="删除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </td>
  </tr>
));

SpecimenRow.displayName = 'SpecimenRow';

const SpecimenListPage = () => {
  const navigate = useNavigate();
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const debouncedSearchKeyword = useDebounce(searchKeyword, 300);

  const loadSpecimens = useCallback(async () => {
    setLoading(true);
    try {
      const response: any = await specimenService.list({
        page,
        pageSize,
        keyword: debouncedSearchKeyword || undefined,
        category: selectedCategory || undefined,
        status: selectedStatus || undefined
      });

      if (response.success) {
        setSpecimens(response.data || []);
        setTotal(response.pagination?.total || 0);
        setTotalPages(response.pagination?.totalPages || 0);
      }
    } catch (error) {
      console.error('加载标本列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearchKeyword, selectedCategory, selectedStatus]);

  useEffect(() => {
    loadSpecimens();
  }, [loadSpecimens]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  }, []);

  const handleView = useCallback((id: string) => {
    navigate(`/specimens/${id}`);
  }, [navigate]);

  const handleEdit = useCallback((id: string) => {
    navigate(`/specimens/${id}/edit`);
  }, [navigate]);

  const handleDelete = useCallback(async (id: string) => {
    if (window.confirm('确定要删除这个标本吗？此操作不可撤销。')) {
      try {
        const response: any = await specimenService.delete(id);
        if (response.success) {
          loadSpecimens();
        }
      } catch (error) {
        console.error('删除标本失败:', error);
      }
    }
  }, [loadSpecimens]);

  const categories = ['被子植物', '裸子植物', '蕨类植物', '苔藓植物', '哺乳动物', '鸟类', '爬行动物'];
  const statuses = [
    { value: 'draft', label: '草稿' },
    { value: 'published', label: '已发布' },
    { value: 'archived', label: '已归档' }
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">标本档案管理</h1>
          <p className="text-slate-500 mt-1">共 {total} 条记录</p>
        </div>
        <button 
          onClick={() => navigate('/specimens/new')}
          className="btn-accent flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          新建标本
        </button>
      </div>

      <div className="card p-6 mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜索标本编号、名称、学名..."
                className="input-field pl-10"
              />
            </div>
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
            className="input-field w-40"
          >
            <option value="">全部分类</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setPage(1); }}
            className="input-field w-32"
          >
            <option value="">全部状态</option>
            {statuses.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            <Filter className="w-5 h-5" />
          </button>
        </form>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">加载中...</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">标本编号</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">名称</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">学名</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">分类</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">状态</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">更新时间</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {specimens.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    specimens.map((specimen) => (
                      <SpecimenRow
                        key={specimen.id}
                        specimen={specimen}
                        onView={handleView}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  显示 {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, total)} 条，共 {total} 条
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                    if (pageNum > totalPages) return null;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-2 rounded-lg text-sm ${
                          page === pageNum 
                            ? 'bg-primary-500 text-white' 
                            : 'hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SpecimenListPage;
