import { useState, useEffect } from 'react';
import { Header } from '../components/ui/Header';
import { LayerPanel } from '../components/ui/LayerPanel';
import { PropertyPanel } from '../components/ui/PropertyPanel';
import { Toolbar } from '../components/ui/Toolbar';
import { StressPanel } from '../components/ui/StressPanel';
import { AddDefectModal } from '../components/ui/AddDefectModal';
import { BatchFilterPanel } from '../components/ui/BatchFilterPanel';
import { InspectionPanel } from '../components/ui/InspectionPanel';
import type { InspectionType } from '../components/ui/InspectionPanel';
import { Scene } from '../components/3d/Scene';
import { useBridgeStore } from '../store/useBridgeStore';
import type { DefectData } from '../../shared';

export default function Home() {
  const { loadBridges, bridges, selectBridge, currentBridge, toolMode, leftPanelOpen, rightPanelOpen, toggleLeftPanel, toggleRightPanel } = useBridgeStore();
  const [newDefectPosition, setNewDefectPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const [inspectionType, setInspectionType] = useState<InspectionType>(null);
  const [inspectionSpeed, setInspectionSpeed] = useState(1);

  useEffect(() => {
    loadBridges();
  }, [loadBridges]);

  useEffect(() => {
    if (bridges.length > 0 && !currentBridge) {
      selectBridge(bridges[0]);
    }
  }, [bridges, currentBridge, selectBridge]);

  const handleAddDefect = (position: { x: number; y: number; z: number }) => {
    if (toolMode === 'annotate') {
      setNewDefectPosition(position);
    }
  };

  const handleSelectDefect = (defect: DefectData) => {
    useBridgeStore.getState().selectDefect(defect);
  };

  const handleStartInspection = (type: InspectionType) => {
    setInspectionType(type);
  };

  const handleStopInspection = () => {
    setInspectionType(null);
  };

  const handleInspectionComplete = () => {
  };

  if (!currentBridge) {
    return (
      <div className="h-screen w-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 overflow-hidden">
      <Header />
      
      <div className="flex-1 flex overflow-hidden relative">
        {leftPanelOpen && (
          <div className="w-64 flex-shrink-0 z-10 space-y-3 overflow-y-auto p-3">
            <LayerPanel />
            <InspectionPanel
              activeInspection={inspectionType}
              onStart={handleStartInspection}
              onStop={handleStopInspection}
              speed={inspectionSpeed}
              onSpeedChange={setInspectionSpeed}
            />
            <BatchFilterPanel />
          </div>
        )}
        
        <div className="flex-1 relative">
          <Scene
            onAddDefect={handleAddDefect}
            onSelectDefect={handleSelectDefect}
            inspectionType={inspectionType}
            inspectionSpeed={inspectionSpeed}
            onInspectionComplete={handleInspectionComplete}
          />
          <Toolbar />
          <StressPanel />
          
          {!leftPanelOpen && (
            <button
              onClick={toggleLeftPanel}
              className="absolute left-4 top-4 z-20 px-3 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
            >
              展开面板
            </button>
          )}
          
          {!rightPanelOpen && (
            <button
              onClick={toggleRightPanel}
              className="absolute right-4 top-4 z-20 px-3 py-2 bg-slate-800/90 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors"
            >
              展开属性
            </button>
          )}
          
          {toolMode === 'annotate' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-sky-600/90 text-white text-sm rounded-lg">
              点击模型任意位置添加病害标注
            </div>
          )}

          {inspectionType && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-green-600/90 text-white text-sm rounded-lg flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              检修模拟进行中
            </div>
          )}
        </div>
        
        {rightPanelOpen && (
          <div className="w-80 flex-shrink-0 z-10">
            <PropertyPanel />
          </div>
        )}
      </div>

      {newDefectPosition && (
        <AddDefectModal
          position={newDefectPosition}
          onClose={() => setNewDefectPosition(null)}
        />
      )}
    </div>
  );
}
