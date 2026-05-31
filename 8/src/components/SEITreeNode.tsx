import React, { useMemo } from 'react';
import { SEIParsedData } from '../types/h265';
import { parseSEIText } from '../utils/h265Parser';
import { formatPTS } from '../utils/seiComparator';

interface SEITreeNodeProps {
  sei: SEIParsedData;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  isHighlighted: boolean;
  isMatched: boolean;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  matchScore?: number;
  ptsDifference?: number;
}

const SEITreeNode: React.FC<SEITreeNodeProps> = ({
  sei,
  index,
  isExpanded,
  isSelected,
  isHighlighted,
  isMatched,
  onToggle,
  onSelect,
  matchScore,
  ptsDifference
}) => {
  const parsedText = useMemo(() => parseSEIText(sei.seiText), [sei.seiText]);

  const formatOffset = (offset: number): string => {
    return `0x${offset.toString(16).padStart(8, '0').toUpperCase()}`;
  };

  const handleHeaderClick = (e: React.MouseEvent) => {
    if (e.detail === 2) {
      onToggle(sei.id);
    } else {
      onSelect(sei.id);
    }
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(sei.id);
  };

  const nodeClassName = `sei-tree-node ${isExpanded ? 'expanded' : ''} ${
    isSelected ? 'selected' : ''
  } ${isHighlighted ? 'highlighted' : ''} ${isMatched ? 'matched' : ''}`;

  return (
    <div className={nodeClassName} id={`sei-node-${sei.id}`}>
      <div
        className="sei-node-header"
        onClick={handleHeaderClick}
      >
        <span className="expand-icon" onClick={handleExpandClick}>
          {isExpanded ? '▼' : '▶'}
        </span>
        <span className="sei-index">SEI #{index + 1}</span>
        <span className="sei-type-badge">{sei.seiPayloadTypeName || 'Unknown'}</span>
        {sei.isUserDataRegistered && (
          <span className="sei-badge registered-badge">Registered</span>
        )}
        {sei.hasWarning && (
          <span className="sei-badge warning-badge">⚠ {sei.warningCode}</span>
        )}
        {sei.ptsSeconds !== undefined && (
          <span className="sei-pts">⏱ {formatPTS(sei.pts)}</span>
        )}
        {matchScore !== undefined && matchScore > 0 && (
          <span className={`match-score-badge ${matchScore >= 80 ? 'excellent' : matchScore >= 50 ? 'good' : 'poor'}`}>
            {matchScore.toFixed(0)}%
          </span>
        )}
        {ptsDifference !== undefined && isFinite(ptsDifference) && (
          <span className="pts-diff-badge">
            Δ {formatPTS(Math.abs(ptsDifference))}
          </span>
        )}
        <span className="sei-offset">@{formatOffset(sei.offset)}</span>
      </div>
      {isExpanded && (
        <div className="sei-node-content">
          <div className="sei-info-grid">
            <div className="info-item">
              <span className="info-label">NAL Type</span>
              <span className="info-value">{sei.nalTypeName} ({sei.nalType})</span>
            </div>
            <div className="info-item">
              <span className="info-label">Temporal ID</span>
              <span className="info-value">{sei.temporalId}</span>
            </div>
            <div className="info-item">
              <span className="info-label">NALU Size</span>
              <span className="info-value">{sei.naluSize} bytes</span>
            </div>
            <div className="info-item">
              <span className="info-label">SEI Payload Type</span>
              <span className="info-value">{sei.seiPayloadType}</span>
            </div>
            {sei.seiPayloadSize !== undefined && (
              <div className="info-item">
                <span className="info-label">Payload Size</span>
                <span className="info-value">{sei.seiPayloadSize} bytes</span>
              </div>
            )}
            {sei.ptsSeconds !== undefined && (
              <div className="info-item">
                <span className="info-label">PTS (秒)</span>
                <span className="info-value">{sei.ptsSeconds.toFixed(3)}s</span>
              </div>
            )}
            {sei.frameNumber !== undefined && (
              <div className="info-item">
                <span className="info-label">帧序号</span>
                <span className="info-value">#{sei.frameNumber}</span>
              </div>
            )}
            {sei.uuid && (
              <div className="info-item full-width">
                <span className="info-label">UUID (ISO/IEC 11578)</span>
                <span className="info-value uuid-value">{sei.uuid}</span>
              </div>
            )}
          </div>

          {sei.hasWarning && sei.warningMessage && (
            <div className="sei-warning-box">
              <span className="warning-icon">⚠</span>
              <div>
                <span className="warning-title">警告 (代码: {sei.warningCode})</span>
                <p className="warning-message">{sei.warningMessage}</p>
              </div>
            </div>
          )}

          {sei.seiText && sei.seiText.length > 0 && (
            <div className="sei-text-section">
              <div className="section-header">
                <span className="section-title">SEI 内容 (解码文本)</span>
                {parsedText.isJson && (
                  <span className="json-badge">JSON</span>
                )}
              </div>
              <pre className="sei-text-content">
                {parsedText.displayText}
              </pre>
            </div>
          )}

          <div className="hex-section">
            <div className="section-header">
              <span className="section-title">十六进制原始数据</span>
            </div>
            <pre className="hex-data-content">
              {sei.hexData}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default SEITreeNode;
