import React from 'react';
import { ParseProgress } from '../types/h265';
import '../styles/ProgressBar.css';

interface ProgressBarProps {
  progress: ParseProgress;
  visible: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, visible }) => {
  if (!visible) return null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="progress-container">
      <div className="progress-header">
        <span className="progress-title">解析进度</span>
        <span className="progress-percentage">{progress.percentage.toFixed(1)}%</span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      <div className="progress-info">
        <span>已处理: {formatSize(progress.processed)} / {formatSize(progress.total)}</span>
        <span>分块: {progress.currentChunk} / {progress.totalChunks}</span>
        <span>发现 SEI: {progress.seiFound}</span>
      </div>
    </div>
  );
};
