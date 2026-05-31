import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Scene3D } from '../modules/Scene3D';
import { TerrainModeling } from '../modules/TerrainModeling';
import { SectionAnalysis } from '../modules/SectionAnalysis';
import { Measurement } from '../modules/Measurement';
import { DataQuery } from '../modules/DataQuery';
import {
  downloadSectionImage,
  exportCurrentView,
  generateSectionReport,
  downloadSectionReport,
  generateSectionProfile,
} from '../utils/exportUtils';

export default function HomePage() {
  const {
    toolMode,
    setToolMode,
    loadTerrainData,
    loadGeologyLayers,
    terrainData,
    geologyLayers,
    sectionPlanes,
    updateSectionPlane,
  } = useAppStore();

  const [layerOpacities, setLayerOpacities] = useState<Record<string, number>>({});
  const [globalLayerOpacity, setGlobalLayerOpacity] = useState(0.9);
  const [terrainOpacity, setTerrainOpacity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [showExportPanel, setShowExportPanel] = useState(false);

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      await Promise.all([loadTerrainData(), loadGeologyLayers()]);
      setIsLoading(false);
    };
    initData();
  }, []);

  const handleLayerOpacityChange = (layerId: string, value: number) => {
    setLayerOpacities(prev => ({
      ...prev,
      [layerId]: value
    }));
  };

  const handleExportSection = () => {
    if (!terrainData || sectionPlanes.length === 0) return;

    const plane = sectionPlanes[sectionPlanes.length - 1];
    const profileData = generateSectionProfile(plane, terrainData, geologyLayers, 300);
    
    downloadSectionImage(profileData, 'geology-section', {
      width: 1200,
      height: 600,
      format: 'png',
      includeLegend: true,
    });
  };

  const handleExportView = () => {
    exportCurrentView('3d-terrain-view', 'png');
  };

  const handleExportReport = () => {
    if (!terrainData || sectionPlanes.length === 0) return;

    const plane = sectionPlanes[sectionPlanes.length - 1];
    const profileData = generateSectionProfile(plane, terrainData, geologyLayers, 300);
    
    downloadSectionReport(profileData, 'geology-section-report');
  };

  const getLayerOpacity = (layerId: string) => {
    return layerOpacities[layerId] ?? globalLayerOpacity;
  };

  return (
    <div className="h-screen flex bg-gray-900 text-white overflow-hidden">
      {/* Left Sidebar */}
      <div className="w-72 bg-gray-800 border-r border-gray-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-xl font-bold text-cyan-400 mb-1">山地地质建模平台</h1>
          <p className="text-xs text-gray-400">三维建模与剖切分析系统</p>
        </div>

        {/* Tool Selection */}
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">工具模式</h3>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setToolMode('navigate')}
              className={`p-2 rounded-lg text-sm transition-colors ${
                toolMode === 'navigate'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              🌍 导航
            </button>
            <button
              onClick={() => setToolMode('section')}
              className={`p-2 rounded-lg text-sm transition-colors ${
                toolMode === 'section'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              ✂️ 剖切分析
            </button>
            <button
              onClick={() => setToolMode('measure-distance')}
              className={`p-2 rounded-lg text-sm transition-colors ${
                toolMode === 'measure-distance'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              📏 距离测量
            </button>
            <button
              onClick={() => setToolMode('measure-height')}
              className={`p-2 rounded-lg text-sm transition-colors ${
                toolMode === 'measure-height'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              📐 高差测量
            </button>
            <button
              onClick={() => setToolMode('measure-angle')}
              className={`p-2 rounded-lg text-sm transition-colors ${
                toolMode === 'measure-angle'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              🔄 角度测量
            </button>
            <button
              onClick={() => setToolMode('query')}
              className={`p-2 rounded-lg text-sm transition-colors ${
                toolMode === 'query'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
            >
              🔍 信息查询
            </button>
          </div>
        </div>

        {/* Terrain Control */}
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">地形控制</h3>
          <TerrainModeling />
        </div>

        {/* Geology Layers */}
        <div className="p-4 border-b border-gray-700 flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">地质岩层</h3>
          
          {/* Global Opacity */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 flex justify-between">
              <span>全局岩层透明度</span>
              <span>{Math.round(globalLayerOpacity * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={globalLayerOpacity}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                setGlobalLayerOpacity(value);
                geologyLayers.forEach(layer => {
                  handleLayerOpacityChange(layer.id, value);
                });
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* Terrain Opacity */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 flex justify-between">
              <span>地形透明度</span>
              <span>{Math.round(terrainOpacity * 100)}%</span>
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={terrainOpacity}
              onChange={(e) => setTerrainOpacity(parseFloat(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
          </div>

          {/* Layer List */}
          <div className="space-y-3">
            {geologyLayers.map((layer) => (
              <div key={layer.id} className="bg-gray-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border-2"
                      style={{
                        backgroundColor: layer.color + '40',
                        borderColor: layer.color,
                      }}
                    />
                    <span className="text-sm text-gray-200">{layer.name}</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span>深度: {layer.depth}m</span>
                  <span>厚度: {layer.thickness}m</span>
                </div>
                
                <label className="text-xs text-gray-500 flex justify-between">
                  <span>透明度</span>
                  <span>{Math.round(getLayerOpacity(layer.id) * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={getLayerOpacity(layer.id)}
                  onChange={(e) => handleLayerOpacityChange(layer.id, parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: layer.color }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Export Panel */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => setShowExportPanel(!showExportPanel)}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm transition-colors mb-2"
          >
            📥 导出功能
          </button>
          
          {showExportPanel && (
            <div className="space-y-2">
              <button
                onClick={handleExportView}
                disabled={!terrainData}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg text-sm transition-colors"
              >
                导出3D视图截图
              </button>
              <button
                onClick={handleExportSection}
                disabled={!terrainData || sectionPlanes.length === 0}
                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg text-sm transition-colors"
              >
                导出地质剖面图
              </button>
              <button
                onClick={handleExportReport}
                disabled={!terrainData || sectionPlanes.length === 0}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-2 px-4 rounded-lg text-sm transition-colors"
              >
                导出剖面报告
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main 3D View */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-cyan-400 border-t-transparent mx-auto mb-4" />
            <p className="text-gray-400">加载数据中...</p>
          </div>
        </div>
      ) : (
        <Scene3D
          layerOpacities={layerOpacities}
          globalLayerOpacity={globalLayerOpacity}
          terrainOpacity={terrainOpacity}
        />
      )}

      {/* Right Sidebar */}
      <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-cyan-400">分析面板</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <SectionAnalysis />
          <Measurement />
          <DataQuery />
        </div>

        {/* Status Bar */}
        <div className="p-3 bg-gray-900 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">当前模式:</span>
            <span className="text-cyan-400 font-medium">
              {toolMode === 'navigate' && '导航模式'}
              {toolMode === 'section' && '剖切分析'}
              {toolMode === 'measure-distance' && '距离测量'}
              {toolMode === 'measure-height' && '高差测量'}
              {toolMode === 'measure-angle' && '角度测量'}
              {toolMode === 'query' && '信息查询'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-gray-400">剖切平面:</span>
            <span className="text-cyan-400">{sectionPlanes.length} 个</span>
          </div>
        </div>
      </div>
    </div>
  );
}
