import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { ParseResult, FileSide, SEIMatchResult } from '../types/h265';
import { SEITree } from './SEITree';
import { DiffView } from './DiffView';
import { findMatchingSEI, findAllMatches, calculateMatchStatistics, formatPTS } from '../utils/seiComparator';
import '../styles/ComparisonPanel.css';

interface ComparisonPanelProps {
  leftResult: ParseResult;
  rightResult: ParseResult;
  onBack: () => void;
}

export const ComparisonPanel: React.FC<ComparisonPanelProps> = ({
  leftResult,
  rightResult,
  onBack
}) => {
  const [leftExpanded, setLeftExpanded] = useState<Set<string>>(new Set());
  const [rightExpanded, setRightExpanded] = useState<Set<string>>(new Set());
  const [selectedLeftId, setSelectedLeftId] = useState<string | null>(null);
  const [selectedRightId, setSelectedRightId] = useState<string | null>(null);
  const [highlightedLeftId, setHighlightedLeftId] = useState<string | null>(null);
  const [highlightedRightId, setHighlightedRightId] = useState<string | null>(null);
  const [isSyncScroll, setIsSyncScroll] = useState(true);
  const [showDiffView, setShowDiffView] = useState(false);
  const [matchResult, setMatchResult] = useState<SEIMatchResult | null>(null);
  const [autoMatchOnSelect, setAutoMatchOnSelect] = useState(true);

  const leftTreeRef = useRef<HTMLDivElement>(null);
  const rightTreeRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  const leftMatches = useMemo(() => {
    const map = new Map<string, { score: number; ptsDiff: number }>();
    const matches = findAllMatches(leftResult.seiData, rightResult.seiData);
    matches.forEach(m => {
      if (m.targetSEI) {
        map.set(m.sourceSEI.id, {
          score: m.matchScore,
          ptsDiff: m.ptsDifference
        });
      }
    });
    return map;
  }, [leftResult.seiData, rightResult.seiData]);

  const rightMatches = useMemo(() => {
    const map = new Map<string, { score: number; ptsDiff: number }>();
    const matches = findAllMatches(rightResult.seiData, leftResult.seiData);
    matches.forEach(m => {
      if (m.targetSEI) {
        map.set(m.sourceSEI.id, {
          score: m.matchScore,
          ptsDiff: m.ptsDifference
        });
      }
    });
    return map;
  }, [leftResult.seiData, rightResult.seiData]);

  const matchStats = useMemo(() => {
    const matches = findAllMatches(leftResult.seiData, rightResult.seiData);
    return calculateMatchStatistics(matches);
  }, [leftResult.seiData, rightResult.seiData]);

  const handleLeftToggle = useCallback((id: string) => {
    setLeftExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleRightToggle = useCallback((id: string) => {
    setRightExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const scrollToSEI = useCallback((_side: FileSide, seiId: string) => {
    const element = document.getElementById(`sei-node-${seiId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleSelect = useCallback((id: string, side: FileSide) => {
    if (side === 'left') {
      setSelectedLeftId(id);
      
      const leftSEI = leftResult.seiData.find(s => s.id === id);
      if (leftSEI && autoMatchOnSelect) {
        const match = findMatchingSEI(leftSEI, rightResult.seiData);
        setMatchResult(match);
        
        if (match.targetSEI) {
          setSelectedRightId(match.targetSEI.id);
          setHighlightedRightId(match.targetSEI.id);
          
          if (isSyncScroll) {
            scrollToSEI('right', match.targetSEI.id);
          }
          
          setTimeout(() => {
            setHighlightedRightId(null);
          }, 3000);
        } else {
          setSelectedRightId(null);
        }
      }
    } else {
      setSelectedRightId(id);
      
      const rightSEI = rightResult.seiData.find(s => s.id === id);
      if (rightSEI && autoMatchOnSelect) {
        const match = findMatchingSEI(rightSEI, leftResult.seiData);
        if (match.targetSEI) {
          setSelectedLeftId(match.targetSEI.id);
          setHighlightedLeftId(match.targetSEI.id);
          
          if (isSyncScroll) {
            scrollToSEI('left', match.targetSEI.id);
          }
          
          setTimeout(() => {
            setHighlightedLeftId(null);
          }, 3000);
        } else {
          setSelectedLeftId(null);
        }
      }
    }
  }, [leftResult.seiData, rightResult.seiData, autoMatchOnSelect, isSyncScroll, scrollToSEI]);

  const handleShowDiff = useCallback(() => {
    if (selectedLeftId) {
      const leftSEI = leftResult.seiData.find(s => s.id === selectedLeftId);
      const rightSEI = selectedRightId 
        ? rightResult.seiData.find(s => s.id === selectedRightId)
        : null;
      
      if (leftSEI) {
        const match = matchResult || findMatchingSEI(leftSEI, rightResult.seiData);
        setMatchResult({
          ...match,
          targetSEI: rightSEI || match.targetSEI
        });
        setShowDiffView(true);
      }
    }
  }, [selectedLeftId, selectedRightId, leftResult.seiData, rightResult.seiData, matchResult]);

  const handleCloseDiff = useCallback(() => {
    setShowDiffView(false);
  }, []);

  useEffect(() => {
    if (!isSyncScroll) return;

    const handleScroll = (_e: Event, source: 'left' | 'right') => {
      if (isSyncing.current) return;
      
      isSyncing.current = true;
      
      const sourceEl = source === 'left' ? leftTreeRef.current : rightTreeRef.current;
      const targetEl = source === 'left' ? rightTreeRef.current : leftTreeRef.current;
      
      if (sourceEl && targetEl) {
        const scrollPercentage = sourceEl.scrollTop / (sourceEl.scrollHeight - sourceEl.clientHeight);
        targetEl.scrollTop = scrollPercentage * (targetEl.scrollHeight - targetEl.clientHeight);
      }
      
      requestAnimationFrame(() => {
        isSyncing.current = false;
      });
    };

    const leftEl = leftTreeRef.current;
    const rightEl = rightTreeRef.current;

    const leftHandler = (e: Event) => handleScroll(e, 'left');
    const rightHandler = (e: Event) => handleScroll(e, 'right');

    if (leftEl) leftEl.addEventListener('scroll', leftHandler, { passive: true });
    if (rightEl) rightEl.addEventListener('scroll', rightHandler, { passive: true });

    return () => {
      if (leftEl) leftEl.removeEventListener('scroll', leftHandler);
      if (rightEl) rightEl.removeEventListener('scroll', rightHandler);
    };
  }, [isSyncScroll]);

  const selectedLeftSEI = selectedLeftId ? leftResult.seiData.find(s => s.id === selectedLeftId) || null : null;
  const selectedRightSEI = selectedRightId ? rightResult.seiData.find(s => s.id === selectedRightId) || null : null;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="comparison-panel">
      <div className="comparison-header">
        <div className="comparison-title">
          <h2>🔄 对比模式</h2>
          <div className="match-stats-summary">
            <span className="stat-pill">
              精确匹配: <strong>{matchStats.exactMatches}</strong>
            </span>
            <span className="stat-pill">
              近似匹配: <strong>{matchStats.closeMatches}</strong>
            </span>
            <span className="stat-pill">
              无匹配: <strong>{matchStats.noMatches}</strong>
            </span>
            <span className="stat-pill">
              平均匹配度: <strong>{matchStats.avgMatchScore.toFixed(0)}%</strong>
            </span>
          </div>
        </div>

        <div className="comparison-controls">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoMatchOnSelect}
              onChange={e => setAutoMatchOnSelect(e.target.checked)}
            />
            自动匹配
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={isSyncScroll}
              onChange={e => setIsSyncScroll(e.target.checked)}
            />
            同步滚动
          </label>
          <button
            className="diff-btn"
            onClick={handleShowDiff}
            disabled={!selectedLeftId}
          >
            🔍 查看差异
          </button>
          <button className="back-btn" onClick={onBack}>
            ← 返回单文件模式
          </button>
        </div>
      </div>

      {selectedLeftSEI && (
        <div className="selection-info">
          <div className="selected-left">
            <span className="label">已选择 (文件 A):</span>
            <span className="value">
              {selectedLeftSEI.seiPayloadTypeName} @ {formatPTS(selectedLeftSEI.pts)}
            </span>
          </div>
          {selectedRightSEI && (
            <div className="selected-right">
              <span className="label">匹配项 (文件 B):</span>
              <span className="value">
                {selectedRightSEI.seiPayloadTypeName} @ {formatPTS(selectedRightSEI.pts)}
              </span>
              {matchResult && (
                <span className={`match-indicator ${matchResult.matchScore >= 80 ? 'good' : 'fair'}`}>
                  {matchResult.matchScore.toFixed(0)}% 匹配
                </span>
              )}
            </div>
          )}
          {!selectedRightSEI && (
            <div className="selected-right no-match">
              <span className="label">匹配项 (文件 B):</span>
              <span className="value">未找到匹配项</span>
            </div>
          )}
        </div>
      )}

      <div className="comparison-content">
        <div className="tree-wrapper left-wrapper">
          <div className="tree-scroll-container" ref={leftTreeRef}>
            <SEITree
              data={leftResult}
              side="left"
              expandedNodes={leftExpanded}
              selectedId={selectedLeftId}
              highlightedId={highlightedLeftId}
              matchedIds={leftMatches}
              filterType="all"
              searchText=""
              onToggle={handleLeftToggle}
              onSelect={handleSelect}
            />
          </div>
          <div className="tree-footer">
            <span className="file-name">{leftResult.fileName}</span>
            <span className="file-size">{formatSize(leftResult.fileSize)}</span>
          </div>
        </div>

        <div className="comparison-divider">
          <div className="divider-line" />
          <div className="divider-label">⟷</div>
          <div className="divider-line" />
        </div>

        <div className="tree-wrapper right-wrapper">
          <div className="tree-scroll-container" ref={rightTreeRef}>
            <SEITree
              data={rightResult}
              side="right"
              expandedNodes={rightExpanded}
              selectedId={selectedRightId}
              highlightedId={highlightedRightId}
              matchedIds={rightMatches}
              filterType="all"
              searchText=""
              onToggle={handleRightToggle}
              onSelect={handleSelect}
            />
          </div>
          <div className="tree-footer">
            <span className="file-name">{rightResult.fileName}</span>
            <span className="file-size">{formatSize(rightResult.fileSize)}</span>
          </div>
        </div>
      </div>

      <DiffView
        leftSEI={selectedLeftSEI}
        rightSEI={selectedRightSEI}
        matchResult={matchResult}
        isVisible={showDiffView}
        onClose={handleCloseDiff}
      />
    </div>
  );
};
