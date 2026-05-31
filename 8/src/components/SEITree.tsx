import React, { useState, useMemo, useCallback } from 'react';
import { ParseResult, FileSide } from '../types/h265';
import SEITreeNode from './SEITreeNode';
import { WarningsPanel } from './WarningsPanel';
import '../styles/SEITree.css';

interface SEITreeProps {
  data: ParseResult;
  side: FileSide;
  expandedNodes: Set<string>;
  selectedId: string | null;
  highlightedId: string | null;
  matchedIds: Map<string, { score: number; ptsDiff: number }>;
  filterType: string;
  searchText: string;
  onToggle: (id: string) => void;
  onSelect: (id: string, side: FileSide) => void;
}

export const SEITree: React.FC<SEITreeProps> = ({
  data,
  side,
  expandedNodes,
  selectedId,
  highlightedId,
  matchedIds,
  filterType,
  searchText,
  onToggle,
  onSelect
}) => {
  const [localFilterType, setLocalFilterType] = useState(filterType);
  const [localSearchText, setLocalSearchText] = useState(searchText);

  const handleToggle = useCallback((id: string) => {
    onToggle(id);
  }, [onToggle]);

  const handleSelect = useCallback((id: string) => {
    onSelect(id, side);
  }, [onSelect, side]);

  const handleExpandAll = useCallback(() => {
    data.seiData.forEach(sei => onToggle(sei.id));
  }, [data.seiData, onToggle]);

  const handleCollapseAll = useCallback(() => {
    data.seiData.forEach(sei => {
      if (expandedNodes.has(sei.id)) {
        onToggle(sei.id);
      }
    });
  }, [data.seiData, expandedNodes, onToggle]);

  const filteredSEI = useMemo(() => {
    let result = data.seiData;

    if (localFilterType === 'registered') {
      result = result.filter(sei => sei.isUserDataRegistered);
    } else if (localFilterType === 'unregistered') {
      result = result.filter(sei => !sei.isUserDataRegistered);
    } else if (localFilterType === 'matched') {
      result = result.filter(sei => matchedIds.has(sei.id));
    } else if (localFilterType === 'unmatched') {
      result = result.filter(sei => !matchedIds.has(sei.id));
    }

    if (localSearchText.trim()) {
      const search = localSearchText.toLowerCase();
      result = result.filter(sei =>
        sei.seiPayloadTypeName?.toLowerCase().includes(search) ||
        sei.seiText.toLowerCase().includes(search) ||
        sei.uuid?.toLowerCase().includes(search) ||
        (sei.ptsSeconds !== undefined && sei.ptsSeconds.toString().includes(search))
      );
    }

    return result;
  }, [data.seiData, localFilterType, localSearchText, matchedIds]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (seconds?: number): string => {
    if (seconds === undefined) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const payloadTypeStats = useMemo(() => {
    const stats: Record<string, number> = {};
    data.seiData.forEach(sei => {
      const type = sei.seiPayloadTypeName || 'Unknown';
      stats[type] = (stats[type] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  }, [data.seiData]);

  const matchedCount = Array.from(matchedIds.keys()).length;

  return (
    <div className={`sei-tree-container side-${side}`}>
      <div className="tree-header">
        <div className="file-side-label">
          {side === 'left' ? '📄 文件 A' : '📄 文件 B'}
        </div>
        
        <div className="tree-stats">
          <div className="stat-item">
            <span className="stat-label">文件名</span>
            <span className="stat-value">{data.fileName}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">文件大小</span>
            <span className="stat-value">{formatSize(data.fileSize)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">NALU 总数</span>
            <span className="stat-value">{data.totalNALUs}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">SEI 总数</span>
            <span className="stat-value">{data.totalSEIs}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">已匹配</span>
            <span className="stat-value match-count">{matchedCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">时长</span>
            <span className="stat-value">{formatDuration(data.duration)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">处理时间</span>
            <span className="stat-value">{(data.processingTime / 1000).toFixed(2)}s</span>
          </div>
          {data.totalWarnings > 0 && (
            <div className="stat-item warning-stat">
              <span className="stat-label">警告</span>
              <span className="stat-value">{data.totalWarnings}</span>
            </div>
          )}
        </div>

        <div className="tree-controls">
          <div className="filter-group">
            <label>筛选:</label>
            <select
              value={localFilterType}
              onChange={e => setLocalFilterType(e.target.value)}
            >
              <option value="all">全部 SEI</option>
              <option value="matched">仅已匹配</option>
              <option value="unmatched">仅未匹配</option>
              <option value="registered">仅 Registered</option>
              <option value="unregistered">仅 Unregistered</option>
            </select>
          </div>
          <div className="search-group">
            <input
              type="text"
              placeholder="搜索 SEI 内容、类型或时间..."
              value={localSearchText}
              onChange={e => setLocalSearchText(e.target.value)}
            />
          </div>
          <div className="button-group">
            <button onClick={handleExpandAll}>全部展开</button>
            <button onClick={handleCollapseAll}>全部折叠</button>
          </div>
        </div>

        {payloadTypeStats.length > 0 && (
          <div className="payload-stats">
            <span className="stats-label">类型分布:</span>
            {payloadTypeStats.map(([type, count]) => (
              <span key={type} className="payload-badge">
                {type}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      <WarningsPanel
        warnings={data.warnings}
        totalWarnings={data.totalWarnings}
        timedOutChunks={data.timedOutChunks}
      />

      <div className="tree-content">
        {filteredSEI.length === 0 ? (
          <div className="no-sei-found">
            没有找到匹配的 SEI 数据
          </div>
        ) : (
          filteredSEI.map((sei, index) => {
            const matchInfo = matchedIds.get(sei.id);
            return (
              <SEITreeNode
                key={sei.id}
                sei={sei}
                index={index}
                isExpanded={expandedNodes.has(sei.id)}
                isSelected={selectedId === sei.id}
                isHighlighted={highlightedId === sei.id}
                isMatched={matchedIds.has(sei.id)}
                onToggle={handleToggle}
                onSelect={handleSelect}
                matchScore={matchInfo?.score}
                ptsDifference={matchInfo?.ptsDiff}
              />
            );
          })
        )}
      </div>
    </div>
  );
};
