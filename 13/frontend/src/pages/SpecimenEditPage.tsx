import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Lock, AlertTriangle, Upload, X, RefreshCw } from 'lucide-react';
import { specimenService, fileService } from '../services';
import { useAuthStore } from '../stores/authStore';
import { useCollaborationStore } from '../stores/collaborationStore';
import { Specimen } from '@shared/types';

const SpecimenEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { socket, joinSpecimen, leaveSpecimen, onlineUsers, editLock, setEditLock } = useCollaborationStore();
  
  const isNew = id === 'new';
  
  const [formData, setFormData] = useState<Partial<Specimen>>({
    specimenNo: '',
    name: '',
    scientificName: '',
    category: '被子植物',
    description: '',
    collector: '',
    collectionDate: undefined,
    collectionLocation: '',
    latitude: undefined,
    longitude: undefined,
    habitat: '',
    status: 'draft'
  });
  
  const [originalVersion, setOriginalVersion] = useState<number>(0);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showLockWarning, setShowLockWarning] = useState(false);

  const categories = ['被子植物', '裸子植物', '蕨类植物', '苔藓植物', '哺乳动物', '鸟类', '爬行动物'];

  const loadSpecimen = useCallback(async () => {
    if (!id || isNew) return;
    try {
      const response: any = await specimenService.get(id);
      if (response.success) {
        const specimen = response.data;
        setFormData(specimen);
        setOriginalVersion(specimen.version);
        
        if (response.data.editLock && response.data.editLock.userId !== user?.id) {
          setShowLockWarning(true);
          setEditLock(response.data.editLock);
        }
      }
    } catch (error) {
      console.error('加载标本失败:', error);
    }
  }, [id, isNew, user, setEditLock]);

  useEffect(() => {
    loadSpecimen();

    if (id && user && socket && !isNew) {
      joinSpecimen(id, user);
    }

    return () => {
      if (id && user && !isNew) {
        leaveSpecimen(id, user);
      }
    };
  }, [id, user, socket, isNew, loadSpecimen, joinSpecimen, leaveSpecimen]);

  const handleChange = (field: keyof Specimen, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || isNew) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const response: any = await fileService.upload(id, file);
        if (response.success) {
          setUploadedFiles(prev => [...prev, response.data]);
        }
      }
    } catch (error) {
      console.error('文件上传失败:', error);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      setError('请输入标本名称');
      return;
    }
    if (!formData.category) {
      setError('请选择标本分类');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (isNew) {
        const response: any = await specimenService.create(formData);
        if (response.success) {
          navigate(`/specimens/${response.data.id}`);
        } else {
          setError(response.message || '创建失败');
        }
      } else if (id) {
        const response: any = await specimenService.update(id, {
          ...formData,
          expectedVersion: originalVersion,
          changeDescription: '编辑更新'
        });

        if (response.success) {
          if (socket) {
            socket.emit('specimen_updated', { 
              specimenId: id, 
              version: response.data.version 
            });
          }
          navigate(`/specimens/${id}`);
        } else {
          if (response.data?.currentVersion) {
            setError(`标本已被更新，请刷新页面后重试。当前版本: v${response.data.currentVersion}`);
          } else {
            setError(response.message || '保存失败');
          }
        }
      }
    } catch (err: any) {
      if (err.message?.includes('版本')) {
        setError('检测到并发冲突，请刷新页面后重试');
      } else {
        setError(err.message || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(isNew ? '/specimens' : `/specimens/${id}`)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {isNew ? '新建标本档案' : '编辑标本档案'}
            </h1>
            <p className="text-slate-500">
              {isNew ? '填写标本基本信息和附件' : `正在编辑: ${formData.name || formData.specimenNo}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onlineUsers.length > 0 && (
            <div className="px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm">
              {onlineUsers.length} 人在线
            </div>
          )}
          <button 
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>

      {showLockWarning && editLock && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-orange-800">标本正在被编辑</p>
              <p className="text-sm text-orange-600 mt-1">
                {editLock.userName} 正在编辑此标本。保存时可能会出现版本冲突。
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold text-slate-800 mb-4">基本信息</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">标本编号 *</label>
                <input
                  type="text"
                  value={formData.specimenNo || ''}
                  onChange={(e) => handleChange('specimenNo', e.target.value)}
                  className="input-field"
                  placeholder="自动生成或手动输入"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">标本名称 *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="input-field"
                  placeholder="请输入标本名称"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">学名</label>
                <input
                  type="text"
                  value={formData.scientificName || ''}
                  onChange={(e) => handleChange('scientificName', e.target.value)}
                  className="input-field italic"
                  placeholder="请输入学名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">分类 *</label>
                <select
                  value={formData.category || ''}
                  onChange={(e) => handleChange('category', e.target.value)}
                  className="input-field"
                  required
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="input-field min-h-24 resize-none"
                  placeholder="请输入标本描述信息"
                />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-slate-800 mb-4">采集信息</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">采集人</label>
                <input
                  type="text"
                  value={formData.collector || ''}
                  onChange={(e) => handleChange('collector', e.target.value)}
                  className="input-field"
                  placeholder="请输入采集人姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">采集日期</label>
                <input
                  type="date"
                  value={formData.collectionDate ? new Date(formData.collectionDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => handleChange('collectionDate', e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">采集地点</label>
                <input
                  type="text"
                  value={formData.collectionLocation || ''}
                  onChange={(e) => handleChange('collectionLocation', e.target.value)}
                  className="input-field"
                  placeholder="请输入采集地点"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">纬度</label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.latitude || ''}
                  onChange={(e) => handleChange('latitude', parseFloat(e.target.value) || undefined)}
                  className="input-field"
                  placeholder="如: 29.520000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">经度</label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.longitude || ''}
                  onChange={(e) => handleChange('longitude', parseFloat(e.target.value) || undefined)}
                  className="input-field"
                  placeholder="如: 103.330000"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">栖息地</label>
                <input
                  type="text"
                  value={formData.habitat || ''}
                  onChange={(e) => handleChange('habitat', e.target.value)}
                  className="input-field"
                  placeholder="请输入栖息地信息"
                />
              </div>
            </div>
          </div>

          {!isNew && (
            <div className="card p-6">
              <h2 className="font-semibold text-slate-800 mb-4">附件上传</h2>
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
                <input
                  type="file"
                  id="file-upload"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <p className="text-slate-600">点击或拖拽文件到此处上传</p>
                  <p className="text-sm text-slate-400 mt-1">支持图片、PDF、文档等格式，单个文件最大500MB</p>
                </label>
              </div>
              {uploading && (
                <div className="mt-4 text-center text-sm text-primary-600">
                  正在上传文件...
                </div>
              )}
              {uploadedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                      <span className="text-sm text-green-700">{file.originalName}</span>
                      <span className="text-xs text-green-600">上传成功</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold text-slate-800 mb-4">发布设置</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">状态</label>
              <select
                value={formData.status || 'draft'}
                onChange={(e) => handleChange('status', e.target.value)}
                className="input-field"
              >
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
                <option value="archived">已归档</option>
              </select>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-slate-800 mb-4">编辑锁状态</h2>
            {editLock ? (
              <div className={`p-4 rounded-lg ${editLock.userId === user?.id ? 'bg-green-50' : 'bg-orange-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {editLock.userId === user?.id ? (
                    <Lock className="w-5 h-5 text-green-600" />
                  ) : (
                    <Lock className="w-5 h-5 text-orange-600" />
                  )}
                  <span className={`font-medium ${editLock.userId === user?.id ? 'text-green-700' : 'text-orange-700'}`}>
                    {editLock.userId === user?.id ? '您持有编辑锁' : '标本已被锁定'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  持有人: {editLock.userName}
                </p>
                <p className="text-sm text-slate-600">
                  过期时间: {new Date(editLock.expiresAt).toLocaleTimeString('zh-CN')}
                </p>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-lg">
                <p className="text-slate-600">当前无编辑锁</p>
              </div>
            )}
          </div>

          {!isNew && (
            <div className="card p-6">
              <h2 className="font-semibold text-slate-800 mb-4">版本信息</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">当前版本</span>
                  <span className="font-medium">v{originalVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">最后更新</span>
                  <span className="font-medium">
                    {formData.updatedAt ? new Date(formData.updatedAt).toLocaleString('zh-CN') : '-'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpecimenEditPage;
