import React, { useMemo } from 'react';
import { SEIParsedData, SEIMatchResult } from '../types/h265';
import { getSEIComparisonData, formatPTS, formatPTSDifference } from '../utils/seiComparator';
import '../styles/DiffView.css';

const ReactJsonDiff = require('react-json-diff').default;

interface DiffViewProps {
  leftSEI: SEIParsedData | null;
  rightSEI: SEIParsedData | null;
  matchResult: SEIMatchResult | null;
  isVisible: boolean;
  onClose: () => void;
}

export const DiffView: React.FC<DiffViewProps> = ({
  leftSEI,
  rightSEI,
  matchResult,
  isVisible,
  onClose
}) => {
  const leftData = useMemo(() => leftSEI ? getSEIComparisonData(leftSEI) : null, [leftSEI]);
  const rightData = useMemo(() => rightSEI ? getSEIComparisonData(rightSEI) : null, [rightSEI]);

  if (!isVisible || !leftSEI) return null;

  const diffLeft = leftData?.payload || {};
  const diffRight = rightData?.payload || {};

  return (
    <div className="diff-view-overlay">
      <div className="diff-view-container">
        <div className="diff-view-header">
          <h3>🔍 SEI 内容差异对比</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {matchResult && (
          <div className="match-summary">
            <div className="match-info">
              <span className="match-label">匹配度</span>
              <span className={`match-score ${matchResult.matchScore >= 80 ? 'excellent' : matchResult.matchScore >= 50 ? 'good' : 'poor'}`}>
                {matchResult.matchScore.toFixed(0)}%
              </span>
            </div>
            <div className="match-info">
              <span className="match-label">PTS 差异</span>
              <span className="pts-diff">
                {formatPTSDifference(matchResult.ptsDifference)}
              </span>
            </div>
            <div className="match-info">
              <span className="match-label">左侧 PTS</span>
              <span>{formatPTS(leftSEI.pts)}</span>
            </div>
            <div className="match-info">
              <span className="match-label">右侧 PTS</span>
              <span>{rightSEI ? formatPTS(rightSEI.pts) : '无匹配'}</span>
            </div>
            {matchResult.isExactMatch && (
              <div className="match-badge exact">
                ✓ 精确匹配
              </div>
            )}
          </div>
        )}

        <div className="diff-content">
          <div className="diff-section payload-diff">
            <h4>Payload 内容差异</h4>
            <div className="diff-panels">
              <div className="diff-panel">
                <div className="panel-header left">
                  文件 A: {leftSEI.seiPayloadTypeName} @ {formatPTS(leftSEI.pts)}
                </div>
                <pre className="diff-json raw-left">
                  {JSON.stringify(diffLeft, null, 2)}
                </pre>
              </div>
              <div className="diff-panel">
                <div className="panel-header right">
                  文件 B: {rightSEI?.seiPayloadTypeName || '无匹配'} @ {rightSEI ? formatPTS(rightSEI.pts) : '-'}
                </div>
                <pre className="diff-json raw-right">
                  {rightSEI ? JSON.stringify(diffRight, null, 2) : '// 无匹配的 SEI 数据'}
                </pre>
              </div>
            </div>
          </div>

          {rightSEI && (
            <div className="diff-section">
              <h4>可视化差异 (JSON Diff)</h4>
              <div className="json-diff-container">
                <ReactJsonDiff
                  left={diffLeft}
                  right={diffRight}
                  showUnchanged
                  collapsed={false}
                />
              </div>
            </div>
          )}

          {leftData && rightData && (
            <div className="diff-section metadata-compare">
              <h4>元数据对比</h4>
              <table className="metadata-table">
                <thead>
                  <tr>
                    <th>属性</th>
                    <th>文件 A</th>
                    <th>文件 B</th>
                    <th>差异</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>SEI 类型</td>
                    <td>{leftData.basic.type} ({leftData.basic.typeCode})</td>
                    <td>{rightData.basic.type} ({rightData.basic.typeCode})</td>
                    <td className={leftData.basic.typeCode === rightData.basic.typeCode ? 'same' : 'different'}>
                      {leftData.basic.typeCode === rightData.basic.typeCode ? '相同' : '不同'}
                    </td>
                  </tr>
                  <tr>
                    <td>Payload 大小</td>
                    <td>{leftData.basic.size} bytes</td>
                    <td>{rightData.basic.size} bytes</td>
                    <td className={leftData.basic.size === rightData.basic.size ? 'same' : 'different'}>
                      {leftData.basic.size === rightData.basic.size ? '相同' : `${(rightData.basic.size as number) - (leftData.basic.size as number)} bytes`}
                    </td>
                  </tr>
                  <tr>
                    <td>PTS 时间</td>
                    <td>{leftData.basic.pts}</td>
                    <td>{rightData.basic.pts}</td>
                    <td className="different">
                      {formatPTSDifference(matchResult?.ptsDifference || 0)}
                    </td>
                  </tr>
                  <tr>
                    <td>文件偏移</td>
                    <td>{leftData.basic.offset}</td>
                    <td>{rightData.basic.offset}</td>
                    <td className="different">-</td>
                  </tr>
                  <tr>
                    <td>UUID</td>
                    <td className="monospace">{leftData.metadata.uuid}</td>
                    <td className="monospace">{rightData.metadata.uuid}</td>
                    <td className={leftData.metadata.uuid === rightData.metadata.uuid ? 'same' : 'different'}>
                      {leftData.metadata.uuid === rightData.metadata.uuid ? '相同' : '不同'}
                    </td>
                  </tr>
                  <tr>
                    <td>类型</td>
                    <td>{leftData.metadata.isUserDataRegistered ? 'Registered' : 'Unregistered'}</td>
                    <td>{rightData.metadata.isUserDataRegistered ? 'Registered' : 'Unregistered'}</td>
                    <td className={leftData.metadata.isUserDataRegistered === rightData.metadata.isUserDataRegistered ? 'same' : 'different'}>
                      {leftData.metadata.isUserDataRegistered === rightData.metadata.isUserDataRegistered ? '相同' : '不同'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
