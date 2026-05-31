import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Edit3, 
  Trash2, 
  Clock, 
  User, 
  MapPin, 
  Calendar,
  FileText,
  Image as ImageIcon,
  Download,
  Lock,
  Unlock,
  AlertTriangle,
  RefreshCw,
  Users,
  MessageSquare,
  Plus,
  Send,
  Tag
} from 'lucide-react';
import { specimenService, fileService, annotationService, versionService, tagService } from '../services';
import { useAuthStore } from '../stores/authStore';
import { useCollaborationStore } from '../stores/collaborationStore';
import { Specimen, SpecimenFile, Annotation, Tag as TagType } from '@shared/types';
import TagSelector from '../components/TagSelector';

const SpecimenDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { socket, joinSpecimen, leaveSpecimen, onlineUsers, setEditLock, editLock } = useCollaborationStore();
  
  const [specimen, setSpecimen] = useState<Specimen | null>(null);
  const [files, setFiles] = useState<SpecimenFile[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'files' | 'annotations' | 'versions'>('info');
  const [newAnnotation, setNewAnnotation] = useState('');
  const [selectedFile, setSelectedFile] = useState<SpecimenFile | null>(null);
  const [showLockWarning, setShowLockWarning] = useState(false);
  const [availableTags, setAvailableTags] = useState<TagType[]>([]);
  const [specimenTags, setSpecimenTags] = useState<string[]>([]);

  const loadSpecimen = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response: any = await specimenService.get(id);
      if (response.success) {
        setSpecimen(response.data);
        if (response.data.editLock) {
          setEditLock(response.data.editLock);
          if (response.data.editLock.userId !== user?.id) {
            setShowLockWarning(true);
          }
        }
      }
    } catch (error) {
      console.error('加载标本详情失败:', error);
    } finally {
      setLoading(false);
    }
  }, [id, user, setEditLock]);

  const loadFiles = useCallback(async () => {
    if (!id) return;
    try {
      const response: any = await fileService.getBySpecimen(id);
      if (response.success) {
        setFiles(response.data || []);
      }
    } catch (error) {
      console.error('加载文件列表失败:', error);
    }
  }, [id]);

  const loadAnnotations = useCallback(async () => {
    if (!id) return;
    try {
      const response: any = await annotationService.getBySpecimen(id);
      if (response.success) {
        setAnnotations(response.data || []);
      }
    } catch (error) {
      console.error('加载批注列表失败:', error);
    }
  }, [id]);

  const loadVersions = useCallback(async () => {
    if (!id) return;
    try {
      const response: any = await versionService.getBySpecimen(id);
      if (response.success) {
        setVersions(response.data || []);
      }
    } catch (error) {
      console.error('加载版本历史失败:', error);
    }
  }, [id]);

  const loadTags = useCallback(async () => {
    if (!id) return;
    try {
      const [tagsResponse, specimenTagsResponse]: any = await Promise.all([
        tagService.list(),
        tagService.getBySpecimen(id)
      ]);
      
      if (tagsResponse.success) {
        setAvailableTags(tagsResponse.data || []);
      }
      if (specimenTagsResponse.success) {
        setSpecimenTags((specimenTagsResponse.data || []).map((t: TagType) => t.id));
      }
    } catch (error) {
      console.error('加载标签失败:', error);
    }
  }, [id]);

  const handleAddTag = useCallback(async (tagId: string) => {
    if (!id) return;
    try {
      const response: any = await tagService.addToSpecimen(id, tagId);
      if (response.success) {
        setSpecimenTags(prev => [...prev, tagId]);
      }
    } catch (error) {
      console.error('添加标签失败:', error);
    }
  }, [id]);

  const handleRemoveTag = useCallback(async (tagId: string) => {
    if (!id) return;
    try {
      const response: any = await tagService.removeFromSpecimen(id, tagId);
      if (response.success) {
        setSpecimenTags(prev => prev.filter(t => t !== tagId));
      }
    } catch (error) {
      console.error('移除标签失败:', error);
    }
  }, [id]);

  const handleCreateTag = useCallback(async (tag: Partial<TagType>) => {
    try {
      const response: any = await tagService.create(tag);
      if (response.success) {
        setAvailableTags(prev => [...prev, response.data]);
      }
    } catch (error) {
      console.error('创建标签失败:', error);
    }
  }, []);

  useEffect(() => {
    loadSpecimen();
    loadFiles();
    loadAnnotations();
    loadVersions();
    loadTags();

    if (id && user && socket) {
      joinSpecimen(id, user);
    }

    return () => {
      if (id && user) {
        leaveSpecimen(id, user);
      }
    };
  }, [id, user, socket, loadSpecimen, loadFiles, loadAnnotations, loadVersions, loadTags, joinSpecimen, leaveSpecimen]);

  useEffect(() => {
    const handleSpecimenUpdate = (event: CustomEvent) => {
      if (event.detail.specimenId === id) {
        loadSpecimen();
      }
    };

    window.addEventListener('specimen-updated', handleSpecimenUpdate as EventListener);
    return () => {
      window.removeEventListener('specimen-updated', handleSpecimenUpdate as EventListener);
    };
  }, [id, loadSpecimen]);

  const handleAcquireLock = async () => {
    if (!id) return;
    try {
      const response: any = await specimenService.acquireLock(id);
      if (response.success) {
        setEditLock(response.data);
        setShowLockWarning(false);
      } else if (response.data) {
        setShowLockWarning(true);
      }
    } catch (error) {
      console.error('获取编辑锁失败:', error);
    }
  };

  const handleReleaseLock = async () => {
    if (!id) return;
    try {
      await specimenService.releaseLock(id);
      setEditLock(null);
      setShowLockWarning(false);
    } catch (error) {
      console.error('释放编辑锁失败:', error);
    }
  };

  const handleAddAnnotation = async () => {
    if (!id || !newAnnotation.trim()) return;
    try {
      const response: any = await annotationService.create({
        specimenId: id,
        content: newAnnotation
      });
      if (response.success) {
        setNewAnnotation('');
        loadAnnotations();
        if (socket) {
          socket.emit('annotation_created', { specimenId: id, annotationId: response.data.id });
        }
      }
    } catch (error) {
      console.error('添加批注失败:', error);
    }
  };

  const handleFilePreview = (file: SpecimenFile) => {
    setSelectedFile(file);
  };

  const handleFileDelete = async (fileId: string) => {
    if (window.confirm('确定要删除这个文件吗？')) {
      try {
        const response: any = await fileService.delete(fileId);
        if (response.success) {
          loadFiles();
        }
      } catch (error) {
        console.error('删除文件失败:', error);
      }
    }
  };

  const handleRollback = async (versionId: string) => {
    if (window.confirm('确定要回滚到此版本吗？这将创建一个新版本。')) {
      try {
        const response: any = await versionService.rollback(versionId);
        if (response.success) {
          loadSpecimen();
          loadVersions();
        }
      } catch (error) {
        console.error('版本回滚失败:', error);
      }
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (!specimen) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-slate-500">标本不存在</p>
          <button onClick={() => navigate('/specimens')} className="btn-primary mt-4">
            返回列表
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/specimens')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{specimen.name}</h1>
            <p className="text-slate-500">
              {specimen.specimenNo} · {specimen.category}
              <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs ${
                specimen.status === 'published' ? 'bg-green-100 text-green-700' :
                specimen.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                'bg-slate-100 text-slate-600'
              }`}>
                {specimen.status === 'published' ? '已发布' : specimen.status === 'draft' ? '草稿' : '已归档'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onlineUsers.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-sm">
              <Users className="w-4 h-4" />
              {onlineUsers.length} 人在线
            </div>
          )}
          
          {editLock && editLock.userId === user?.id ? (
            <button 
              onClick={handleReleaseLock}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
            >
              <Unlock className="w-4 h-4" />
              释放编辑锁
            </button>
          ) : editLock ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg">
              <Lock className="w-4 h-4" />
              {editLock.userName} 正在编辑
            </div>
          ) : (
            <button 
              onClick={handleAcquireLock}
              className="flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
            >
              <Lock className="w-4 h-4" />
              获取编辑锁
            </button>
          )}

          <button 
            onClick={() => navigate(`/specimens/${id}/edit`)}
            disabled={!!editLock && editLock.userId !== user?.id}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Edit3 className="w-4 h-4" />
            编辑
          </button>
        </div>
      </div>

      {showLockWarning && (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-orange-800">标本正在被编辑</p>
            <p className="text-sm text-orange-600 mt-1">
              {editLock?.userName} 正在编辑此标本，您的修改可能会被覆盖。建议等待编辑完成或获取编辑锁。
            </p>
            <div className="mt-2 flex gap-2">
              <button onClick={handleAcquireLock} className="text-sm text-orange-700 hover:text-orange-800 font-medium">
                强制获取编辑锁
              </button>
              <button onClick={() => setShowLockWarning(false)} className="text-sm text-slate-500 hover:text-slate-600">
                仍要继续
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="border-b border-slate-200 px-6">
              <div className="flex gap-6">
                {[
                  { key: 'info', label: '基本信息' },
                  { key: 'files', label: `附件 (${files.length})` },
                  { key: 'annotations', label: `批注 (${annotations.length})` },
                  { key: 'versions', label: `版本 (${versions.length})` }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.key 
                        ? 'border-primary-500 text-primary-600' 
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {activeTab === 'info' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="w-4 h-4 text-slate-500" />
                      <label className="text-sm font-medium text-slate-500">标签</label>
                    </div>
                    <TagSelector
                      availableTags={availableTags}
                      selectedTagIds={specimenTags}
                      onAddTag={handleAddTag}
                      onRemoveTag={handleRemoveTag}
                      onCreateTag={handleCreateTag}
                      disabled={!user || !['admin', 'specimen_admin'].includes(user.role)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium text-slate-500">标本编号</label>
                      <p className="mt-1 font-mono text-slate-800">{specimen.specimenNo}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">分类</label>
                      <p className="mt-1 text-slate-800">{specimen.category}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">学名</label>
                      <p className="mt-1 italic text-slate-800">{specimen.scientificName || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">采集人</label>
                      <p className="mt-1 text-slate-800">{specimen.collector || '-'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">采集日期</label>
                      <p className="mt-1 text-slate-800">
                        {specimen.collectionDate ? new Date(specimen.collectionDate).toLocaleDateString('zh-CN') : '-'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-500">采集地点</label>
                      <p className="mt-1 text-slate-800">{specimen.collectionLocation || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-slate-500">栖息地</label>
                      <p className="mt-1 text-slate-800">{specimen.habitat || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-slate-500">描述</label>
                      <p className="mt-1 text-slate-800 whitespace-pre-wrap">{specimen.description || '-'}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200">
                    <h3 className="font-medium text-slate-700 mb-4">元数据</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-slate-500">
                        <User className="w-4 h-4" />
                        创建人: {specimen.createdBy}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock className="w-4 h-4" />
                        创建时间: {new Date(specimen.createdAt).toLocaleString('zh-CN')}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <User className="w-4 h-4" />
                        更新人: {specimen.updatedBy}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock className="w-4 h-4" />
                        更新时间: {new Date(specimen.updatedAt).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <div>
                  {files.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <FileText className="w-12 h-12 mx-auto mb-3" />
                      <p>暂无附件</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {files.map(file => (
                        <div 
                          key={file.id} 
                          className="border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group"
                        >
                          <div 
                            className="aspect-video bg-slate-100 flex items-center justify-center cursor-pointer relative"
                            onClick={() => handleFilePreview(file)}
                          >
                            {file.fileType === 'image' ? (
                              <img 
                                src={file.url} 
                                alt={file.originalName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  const parent = (e.target as HTMLImageElement).parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="flex items-center justify-center h-full"><div class="text-center"><FileText class="w-8 h-8 mx-auto text-slate-400" /><p class="text-xs text-slate-500 mt-1">图片加载失败</p></div></div>';
                                  }
                                }}
                              />
                            ) : (
                              <div className="text-center">
                                <FileText className="w-8 h-8 mx-auto text-slate-400" />
                                <p className="text-xs text-slate-500 mt-1">{file.mimeType}</p>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <span className="text-white text-sm">点击预览</span>
                            </div>
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-medium text-slate-800 truncate" title={file.originalName}>
                              {file.originalName}
                            </p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-slate-500">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </span>
                              <div className="flex gap-1">
                                <a 
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1 text-slate-400 hover:text-primary-500"
                                  title="下载"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                                <button 
                                  onClick={() => handleFileDelete(file.id)}
                                  className="p-1 text-slate-400 hover:text-red-500"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'annotations' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAnnotation}
                      onChange={(e) => setNewAnnotation(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddAnnotation()}
                      placeholder="添加批注..."
                      className="input-field flex-1"
                    />
                    <button onClick={handleAddAnnotation} className="btn-primary">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>

                  {annotations.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2" />
                      <p>暂无批注</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {annotations.map((annotation: any) => (
                        <div key={annotation.id} className="border border-slate-200 rounded-xl p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-primary-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-800">
                                  {annotation.createdBy?.realName || '未知用户'}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {new Date(annotation.createdAt).toLocaleString('zh-CN')}
                                </p>
                              </div>
                            </div>
                            <span className={`badge ${
                              annotation.status === 'open' ? 'bg-blue-100 text-blue-700' :
                              annotation.status === 'resolved' ? 'bg-green-100 text-green-700' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {annotation.status === 'open' ? '待处理' : annotation.status === 'resolved' ? '已解决' : '已关闭'}
                            </span>
                          </div>
                          <p className="text-slate-700">{annotation.content}</p>
                          
                          {annotation.replies?.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                              {annotation.replies.map((reply: any) => (
                                <div key={reply.id} className="flex items-start gap-2 pl-4">
                                  <div className="w-6 h-6 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <User className="w-3 h-3 text-slate-500" />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm">
                                      <span className="font-medium text-slate-700">
                                        {reply.createdBy?.realName || '未知用户'}
                                      </span>
                                      <span className="text-slate-500 ml-2">
                                        {new Date(reply.createdAt).toLocaleString('zh-CN')}
                                      </span>
                                    </p>
                                    <p className="text-sm text-slate-600">{reply.content}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'versions' && (
                <div className="space-y-4">
                  {versions.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Clock className="w-8 h-8 mx-auto mb-2" />
                      <p>暂无版本记录</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200"></div>
                      {versions.map((version, index) => (
                        <div key={version.id} className="relative pl-10 pb-6">
                          <div className="absolute left-2 w-5 h-5 bg-primary-500 rounded-full border-4 border-white shadow"></div>
                          <div className="border border-slate-200 rounded-xl p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-semibold text-slate-800">版本 v{version.version}</p>
                                <p className="text-sm text-slate-500">
                                  {new Date(version.changedAt).toLocaleString('zh-CN')}
                                </p>
                              </div>
                              {index > 0 && (
                                <button 
                                  onClick={() => handleRollback(version.id)}
                                  className="text-sm text-primary-500 hover:text-primary-600"
                                >
                                  回滚到此版本
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-slate-600">{version.changeDescription}</p>
                            {version.changes?.length > 0 && (
                              <div className="mt-2 text-xs text-slate-500">
                                修改了 {version.changes.length} 个字段
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="font-semibold text-slate-800 mb-4">在线协作者</h3>
            {onlineUsers.length === 0 ? (
              <p className="text-sm text-slate-500">暂无在线用户</p>
            ) : (
              <div className="space-y-3">
                {onlineUsers.map((u, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{u.userName}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(u.joinedAt).toLocaleTimeString('zh-CN')} 加入
                      </p>
                    </div>
                    <div className="ml-auto w-2 h-2 bg-green-500 rounded-full"></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="font-semibold text-slate-800 mb-4">编辑锁状态</h3>
            {editLock ? (
              <div className={`p-4 rounded-lg ${editLock.userId === user?.id ? 'bg-green-50' : 'bg-orange-50'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {editLock.userId === user?.id ? (
                    <Unlock className="w-5 h-5 text-green-600" />
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
                <div className="flex items-center gap-2">
                  <Unlock className="w-5 h-5 text-slate-400" />
                  <span className="text-slate-600">当前无编辑锁</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedFile(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">{selectedFile.originalName}</h3>
              <button onClick={() => setSelectedFile(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-100" style={{ minHeight: '400px' }}>
              {selectedFile.fileType === 'image' ? (
                <img 
                  src={selectedFile.url} 
                  alt={selectedFile.originalName}
                  className="max-w-full max-h-[60vh] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).outerHTML = '<div class="text-center"><FileText class="w-16 h-16 mx-auto text-slate-400" /><p class="text-slate-500 mt-2">图片加载失败，请检查文件服务</p></div>';
                  }}
                />
              ) : (
                <iframe 
                  src={selectedFile.url}
                  className="w-full h-[60vh] bg-white"
                  title={selectedFile.originalName}
                />
              )}
            </div>
            <div className="p-4 border-t border-slate-200 flex items-center justify-between">
              <div className="text-sm text-slate-500">
                大小: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · 类型: {selectedFile.mimeType}
              </div>
              <a 
                href={selectedFile.url}
                download={selectedFile.originalName}
                className="btn-primary flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                下载文件
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpecimenDetailPage;
