import React, { useState, useCallback } from 'react';
import '../styles/FileUpload.css';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isProcessing: boolean;
  isWasmReady: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, isProcessing, isWasmReady }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing && isWasmReady) {
      setIsDragging(true);
    }
  }, [isProcessing, isWasmReady]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (isProcessing || !isWasmReady) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileInput(files[0]);
    }
  }, [isProcessing, isWasmReady]);

  const handleFileInput = (file: File) => {
    setError(null);
    
    const validExtensions = ['.mp4', '.ts', '.h265', '.hevc', '.265', '.bin'];
    const fileName = file.name.toLowerCase();
    
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValid) {
      setError('请上传 MP4、TS、H.265 或 HEVC 格式的文件');
      return;
    }
    
    onFileSelect(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileInput(files[0]);
    }
  };

  return (
    <div className="file-upload-container">
      <div
        className={`file-drop-zone ${isDragging ? 'dragging' : ''} ${isProcessing || !isWasmReady ? 'disabled' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p className="upload-text">
          {isProcessing ? (
          '正在解析文件...'
          ) : !isWasmReady ? (
            '正在加载 WebAssembly 模块...'
          ) : (
            <>
              拖拽 H.265 文件到此处，或
              <label className="file-input-label">
                点击选择文件
                <input
                  type="file"
                  accept=".mp4,.ts,.h265,.hevc,.265,.bin"
                  onChange={handleFileChange}
                  disabled={isProcessing || !isWasmReady}
                  hidden
                />
              </label>
            </>
          )}
        </p>
        <p className="file-hint">支持 MP4、TS、H.265、HEVC 格式，支持大文件分块解析</p>
      </div>
      {error && (
        <div className="error-message">{error}</div>
      )}
    </div>
  );
};
