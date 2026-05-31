import React, { useState } from 'react';
import { WarningEntry } from '../types/h265';
import '../styles/WarningsPanel.css';

interface WarningsPanelProps {
  warnings: WarningEntry[];
  totalWarnings: number;
  timedOutChunks: number;
}

export const WarningsPanel: React.FC<WarningsPanelProps> = ({ warnings, totalWarnings, timedOutChunks }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayCount, setDisplayCount] = useState(20);

  if (totalWarnings === 0 && timedOutChunks === 0) {
    return null;
  }

  const displayedWarnings = warnings.slice(0, displayCount);
  const hasMore = warnings.length > displayCount;

  const formatOffset = (offset: number): string => {
    return `0x${offset.toString(16).padStart(8, '0').toUpperCase()}`;
  };

  const handleLoadMore = () => {
    setDisplayCount(prev => prev + 20);
  };

  return (
    <div className={`warnings-panel ${isExpanded ? 'expanded' : ''}`}>
      <div
        className="warnings-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="warnings-title">
          <span className="warning-icon">⚠</span>
          <span>解析警告</span>
          {totalWarnings > 0 && (
            <span className="warning-badge">{totalWarnings}</span>
          )}
          {timedOutChunks > 0 && (
            <span className="timeout-badge">超时: {timedOutChunks}</span>
          )}
        </div>
        <span className="expand-toggle">
          {isExpanded ? '收起 ▲' : '展开 ▼'}
        </span>
      </div>
      
      {isExpanded && (
        <div className="warnings-content">
          {warnings.length === 0 ? (
            <div className="no-warnings">
              无详细警告信息
            </div>
          ) : (
            <>
              <div className="warnings-list">
                {displayedWarnings.map((warning, index) => (
                  <div key={index} className="warning-item">
                    <div className="warning-offset">
                      @{formatOffset(warning.offset)}
                    </div>
                    <div className="warning-message">
                      <span className="warning-code">
                        [{warning.warningCode}]
                      </span>
                      {warning.message}
                    </div>
                  </div>
                ))}
              </div>
              
              {hasMore && (
                <button
                  className="load-more-btn"
                  onClick={handleLoadMore}
                >
                  加载更多 ({warnings.length - displayCount} 剩余)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
