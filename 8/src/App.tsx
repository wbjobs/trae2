import React, { useState, useCallback } from 'react';
import { FileUpload } from './components/FileUpload';
import { ProgressBar } from './components/ProgressBar';
import { SEITree } from './components/SEITree';
import { ComparisonPanel } from './components/ComparisonPanel';
import { ParseProgress, ParseResult, FileSide } from './types/h265';
import { parseFileInChunks } from './utils/h265Parser';
import './styles/App.css';

type AppMode = 'single' | 'compare';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSide, setProcessingSide] = useState<FileSide | null>(null);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);
  const [leftResult, setLeftResult] = useState<ParseResult | null>(null);
  const [rightResult, setRightResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [leftExpanded, setLeftExpanded] = useState<Set<string>>(new Set());
  const [leftSelected, setLeftSelected] = useState<string | null>(null);
  const leftFilter = 'all';
  const leftSearch = '';

  const handleFileSelect = useCallback(async (file: File, side: FileSide = 'left') => {
    setIsProcessing(true);
    setProcessingSide(side);
    setError(null);
    setParseProgress({
      processed: 0,
      total: file.size,
      percentage: 0,
      currentChunk: 0,
      totalChunks: Math.ceil(file.size / (8 * 1024 * 1024)),
      seiFound: 0
    });

    try {
      const result = await parseFileInChunks(
        file,
        (progress: ParseProgress) => {
          setParseProgress({ ...progress });
        }
      );

      if (side === 'left') {
        setLeftResult(result);
        setLeftExpanded(new Set());
        setLeftSelected(null);
      } else {
        setRightResult(result);
      }
    } catch (err) {
      setError(`解析错误: ${err}`);
    } finally {
      setIsProcessing(false);
      setProcessingSide(null);
    }
  }, []);

  const handleFileSelectLeft = useCallback((file: File) => {
    handleFileSelect(file, 'left');
  }, [handleFileSelect]);

  const handleFileSelectRight = useCallback((file: File) => {
    handleFileSelect(file, 'right');
  }, [handleFileSelect]);

  const handleReset = useCallback(() => {
    setLeftResult(null);
    setRightResult(null);
    setParseProgress(null);
    setError(null);
    setLeftExpanded(new Set());
    setLeftSelected(null);
  }, []);

  const handleBackToSingle = useCallback(() => {
    setMode('single');
    setRightResult(null);
  }, []);

  const handleToggleLeft = useCallback((id: string) => {
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

  const handleSelectSingle = useCallback((id: string, side: FileSide) => {
    if (side === 'left') {
      setLeftSelected(id);
      setLeftExpanded(prev => {
        const next = new Set(prev);
        if (!next.has(id)) {
          next.add(id);
        }
        return next;
      });
    }
  }, []);

  const handleSwitchMode = useCallback((newMode: AppMode) => {
    setMode(newMode);
    if (newMode === 'single') {
      setRightResult(null);
    }
  }, []);

  const canShowComparison = mode === 'compare' && leftResult && rightResult;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>H.265 SEI Parser</h1>
            <p className="subtitle">H.265/HEVC NAL Unit & SEI 信息解析工具</p>
          </div>
          <div className="mode-switcher">
            <button
              className={`mode-btn ${mode === 'single' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('single')}
            >
              📄 单文件模式
            </button>
            <button
              className={`mode-btn ${mode === 'compare' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('compare')}
            >
              🔄 对比模式
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-state">
            <div className="error-icon">⚠</div>
            <h3>解析错误</h3>
            <p>{error}</p>
          </div>
        )}

        {mode === 'single' && !canShowComparison && (
          <>
            {!leftResult && (
              <FileUpload
                onFileSelect={handleFileSelectLeft}
                isProcessing={isProcessing}
                isWasmReady={true}
              />
            )}

            {isProcessing && processingSide === 'left' && parseProgress && (
              <ProgressBar
                progress={parseProgress}
                visible={true}
              />
            )}

            {leftResult && !isProcessing && (
              <div className="result-container">
                <div className="result-header">
                  <h2>解析结果</h2>
                  <div className="result-actions">
                    <button className="reset-btn" onClick={handleReset}>
                      解析新文件
                    </button>
                  </div>
                </div>
                <SEITree
                  data={leftResult}
                  side="left"
                  expandedNodes={leftExpanded}
                  selectedId={leftSelected}
                  highlightedId={null}
                  matchedIds={new Map()}
                  filterType={leftFilter}
                  searchText={leftSearch}
                  onToggle={handleToggleLeft}
                  onSelect={handleSelectSingle}
                />
              </div>
            )}
          </>
        )}

        {mode === 'compare' && !canShowComparison && (
          <div className="compare-upload-container">
            <div className="compare-upload-header">
              <h2>对比模式 - 加载两个文件进行对比</h2>
              <p className="compare-hint">分别在左右两侧上传视频文件，系统将自动匹配相似时间点的 SEI 信息</p>
            </div>
            
            <div className="compare-upload-grid">
              <div className="upload-slot left-slot">
                <div className="slot-label">
                  <span className="slot-indicator left-indicator" />
                  文件 A (左侧)
                </div>
                {isProcessing && processingSide === 'left' && parseProgress && (
                  <ProgressBar progress={parseProgress} visible={true} />
                )}
                {!leftResult && !(isProcessing && processingSide === 'left') && (
                  <FileUpload
                    onFileSelect={handleFileSelectLeft}
                    isProcessing={isProcessing}
                    isWasmReady={true}
                  />
                )}
                {leftResult && !isProcessing && (
                  <div className="file-loaded">
                    <div className="loaded-icon">✓</div>
                    <div className="loaded-info">
                      <div className="loaded-name">{leftResult.fileName}</div>
                      <div className="loaded-details">
                        {leftResult.totalSEIs} SEI · {(leftResult.processingTime / 1000).toFixed(2)}s
                      </div>
                    </div>
                    <button className="change-btn" onClick={handleReset}>
                      更换
                    </button>
                  </div>
                )}
              </div>

              <div className="upload-slot right-slot">
                <div className="slot-label">
                  <span className="slot-indicator right-indicator" />
                  文件 B (右侧)
                </div>
                {isProcessing && processingSide === 'right' && parseProgress && (
                  <ProgressBar progress={parseProgress} visible={true} />
                )}
                {!rightResult && !(isProcessing && processingSide === 'right') && (
                  <FileUpload
                    onFileSelect={handleFileSelectRight}
                    isProcessing={isProcessing}
                    isWasmReady={true}
                  />
                )}
                {rightResult && !isProcessing && (
                  <div className="file-loaded">
                    <div className="loaded-icon">✓</div>
                    <div className="loaded-info">
                      <div className="loaded-name">{rightResult.fileName}</div>
                      <div className="loaded-details">
                        {rightResult.totalSEIs} SEI · {(rightResult.processingTime / 1000).toFixed(2)}s
                      </div>
                    </div>
                    <button className="change-btn" onClick={() => setRightResult(null)}>
                      更换
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="compare-actions">
              <button className="back-btn" onClick={handleBackToSingle}>
                ← 返回单文件模式
              </button>
            </div>
          </div>
        )}

        {canShowComparison && (
          <ComparisonPanel
            leftResult={leftResult!}
            rightResult={rightResult!}
            onBack={handleBackToSingle}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>高性能 H.265/HEVC SEI 解析器 - 支持大文件分块解析 · 支持双文件对比</p>
      </footer>
    </div>
  );
};

export default App;
