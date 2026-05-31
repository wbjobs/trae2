import { useState, useEffect } from 'react';
import { FileText, Search, Download, Trash2, Image as ImageIcon, Filter, RefreshCw } from 'lucide-react';
import { fileService, specimenService } from '../services';
import { SpecimenFile } from '@shared/types';

const FileManagementPage = () => {
  const [files, setFiles] = useState<SpecimenFile[]>([]);
  const [specimens, setSpecimens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedSpecimen, setSelectedSpecimen] = useState('');
  const [previewFile, setPreviewFile] = useState<SpecimenFile | null>(null);

  const loadFiles = async () => {
    setLoading(true);
    try {
      let allFiles: SpecimenFile[] = [];
      
      if (selectedSpecimen) {
        const response: any = await fileService.getBySpecimen(selectedSpecimen);
        if (response.success) {
          allFiles = response.data || [];
        }
      } else {
        const specimenResponse: any = await specimenService.list({ pageSize: 100 });
        if (specimenResponse.success) {
          const specimens = specimenResponse.data || [];
          for (const specimen of specimens) {
            const fileResponse: any = await fileService.getBySpecimen(specimen.id);
            if (fileResponse.success) {
              allFiles = [...allFiles, ...(fileResponse.data || [])];
            }
          }
        }
      }

      if (searchKeyword) {
        allFiles = allFiles.filter(f => 
          f.originalName.toLowerCase().includes(searchKeyword.toLowerCase())
        );
      }

      if (selectedType) {
        allFiles = allFiles.filter(f => f.fileType === selectedType);
      }

      setFiles(allFiles);
    } catch (error) {
      console.error('加载文件列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSpecimens = async () => {
    try {
      const response: any = await specimenService.list({ pageSize: 100 });
      if (response.success) {
        setSpecimens(response.data || []);
      }
    } catch (error) {
      console.error('加载标本列表失败:', error);
    }
  };

  useEffect(() => {
    loadFiles();
    loadSpecimens();
  }, [searchKeyword, selectedType, selectedSpecimen]);

  const handleDelete = async (fileId: string) => {
    if (window.confirm('确定要删除这个文件吗？')) {
      try {
        await fileService.delete(fileId);
        loadFiles();
      } catch (error) {
        console.error('删除文件失败:', error);
      }
    }
  };

  const fileTypes = [
    { value: 'image', label: '图片' },
    { value: 'document', label: '文档' },
    { value: 'video', label: '视频' },
    { value: 'other', label: '其他' }
  ];

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image':
        return <ImageIcon className="w-6 h-6 text-green-500" />;
      case 'document':
        return <FileText className="w-6 h-6 text-blue-500" />;
      case 'video':
        return <FileText className="w-6 h-6 text-purple-500" />;
      default:
        return <FileText className="w-6 h-6 text-slate-500" />;
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">文件管理</h1>
          <p className="text-slate-500 mt-1">共 {files.length} 个文件</p>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索文件名..."
              className="input-field pl-10"
            />
          </div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="input-field w-32"
          >
            <option value="">全部类型</option>
            {fileTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select
            value={selectedSpecimen}
            onChange={(e) => setSelectedSpecimen(e.target.value)}
            className="input-field w-48"
          >
            <option value="">全部标本</option>
            {specimens.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
            <p className="mt-2">加载中...</p>
          </div>
        ) : files.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-slate-300" />
            <p className="text-slate-500 mt-3">暂无文件</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">文件名</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">类型</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">大小</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">标本</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase">上传时间</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {files.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {getFileIcon(file.fileType)}
                        <div>
                          <p className="font-medium text-slate-800 truncate max-w-xs">{file.originalName}</p>
                          <p className="text-xs text-slate-500">{file.mimeType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge ${
                        file.fileType === 'image' ? 'bg-green-100 text-green-700' :
                        file.fileType === 'document' ? 'bg-blue-100 text-blue-700' :
                        file.fileType === 'video' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {fileTypes.find(t => t.value === file.fileType)?.label || file.fileType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {specimens.find(s => s.id === file.specimenId)?.name || file.specimenId}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(file.createdAt).toLocaleString('zh-CN')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => setPreviewFile(file)}
                          className="p-2 text-slate-400 hover:text-primary-500 hover:bg-primary-50 rounded-lg transition-colors"
                          title="预览"
                        >
                          <Filter className="w-4 h-4" />
                        </button>
                        <a 
                          href={file.url}
                          download={file.originalName}
                          className="p-2 text-slate-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors"
                          title="下载"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button 
                          onClick={() => handleDelete(file.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
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
        )}
      </div>

      {previewFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setPreviewFile(null)}>
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">{previewFile.originalName}</h3>
              <button onClick={() => setPreviewFile(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-100" style={{ minHeight: '400px' }}>
              {previewFile.fileType === 'image' ? (
                <img 
                  src={previewFile.url} 
                  alt={previewFile.originalName}
                  className="max-w-full max-h-[60vh] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).outerHTML = '<div class="text-center"><FileText class="w-16 h-16 mx-auto text-slate-400" /><p class="text-slate-500 mt-2">图片加载失败</p></div>';
                  }}
                />
              ) : (
                <iframe 
                  src={previewFile.url}
                  className="w-full h-[60vh] bg-white"
                  title={previewFile.originalName}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManagementPage;
