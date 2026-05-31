import { useState } from 'react';
import { Info, Crosshair, Ruler, Database, ChevronDown, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';

interface TabProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function Tab({ active, onClick, icon, label }: TabProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'text-cyan-400 border-cyan-400'
          : 'text-gray-400 border-transparent hover:text-gray-200'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = true }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-gray-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-gray-700/30 transition-colors"
      >
        <span className="flex-1 text-sm font-medium text-gray-200">{title}</span>
        {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {isOpen && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function InfoTab() {
  const { terrainData, geologyLayers, selectedPoint } = useAppStore();

  return (
    <div className="space-y-1">
      <CollapsibleSection title="项目信息">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">项目名称</span>
            <span className="text-gray-200">山地地质勘测项目</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">创建时间</span>
            <span className="text-gray-200">2024-01-15</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">数据来源</span>
            <span className="text-gray-200">现场勘测</span>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="地形统计">
        {terrainData ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">分辨率</span>
              <span className="text-gray-200">{terrainData.resolution} x {terrainData.resolution}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">最高海拔</span>
              <span className="text-gray-200">{terrainData.bounds.maxZ.toFixed(2)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">最低海拔</span>
              <span className="text-gray-200">{terrainData.bounds.minZ.toFixed(2)} m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">相对高差</span>
              <span className="text-gray-200">
                {(terrainData.bounds.maxZ - terrainData.bounds.minZ).toFixed(2)} m
              </span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">暂无地形数据</p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="选中点信息">
        {selectedPoint ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">X 坐标</span>
              <span className="text-gray-200">{selectedPoint[0].toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Y 坐标</span>
              <span className="text-gray-200">{selectedPoint[1].toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Z 坐标（高程）</span>
              <span className="text-cyan-400 font-medium">{selectedPoint[2].toFixed(2)} m</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">点击地形选择点</p>
        )}
      </CollapsibleSection>
    </div>
  );
}

function MeasurementTab() {
  const { measurements, clearMeasurements, removeMeasurement } = useAppStore();

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-gray-200">测量记录</h3>
        {measurements.length > 0 && (
          <button
            onClick={clearMeasurements}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            清空全部
          </button>
        )}
      </div>

      {measurements.length > 0 ? (
        <div className="space-y-2">
          {measurements.map((m, index) => (
            <div
              key={m.id}
              className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700"
            >
              <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                <span className="text-cyan-400 text-sm font-bold">{index + 1}</span>
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-200">
                  {m.type === 'distance' && '距离测量'}
                  {m.type === 'angle' && '角度测量'}
                  {m.type === 'height' && '高差测量'}
                </div>
                <div className="text-lg font-bold text-cyan-400">
                  {m.value.toFixed(2)} {m.unit}
                </div>
              </div>
              <button
                onClick={() => removeMeasurement(m.id)}
                className="p-1 text-gray-400 hover:text-red-400 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Ruler size={48} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-500 text-sm">暂无测量记录</p>
          <p className="text-gray-600 text-xs mt-1">使用测量工具在3D场景中点击进行测量</p>
        </div>
      )}
    </div>
  );
}

function QueryTab() {
  const { queryResult, selectedPoint, geologyLayers } = useAppStore();

  const getLayerAtDepth = (depth: number) => {
    return geologyLayers.find((layer) => depth >= layer.depth && depth < layer.depth + layer.thickness);
  };

  return (
    <div className="p-4">
      <h3 className="text-sm font-medium text-gray-200 mb-4">岩层信息查询</h3>

      {queryResult ? (
        <div className="space-y-4">
          <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: queryResult.layerName ? geologyLayers.find(l => l.name === queryResult.layerName)?.color || '#888' : '#888' }}
              />
              <span className="font-medium text-white">{queryResult.layerName}</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">岩石类型</span>
                <span className="text-gray-200">{queryResult.rockType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">埋藏深度</span>
                <span className="text-gray-200">{queryResult.depth.toFixed(2)} m</span>
              </div>
            </div>
          </div>

          <CollapsibleSection title="物理属性">
            <div className="space-y-2 text-sm">
              {Object.entries(queryResult.properties).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-400">{key}</span>
                  <span className="text-gray-200">{String(value)}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      ) : (
        <div className="text-center py-8">
          <Database size={48} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-500 text-sm">暂无查询结果</p>
          <p className="text-gray-600 text-xs mt-1">使用查询工具点击地形获取岩层信息</p>
        </div>
      )}
    </div>
  );
}

export function RightPanel() {
  const [activeTab, setActiveTab] = useState<'info' | 'measurement' | 'query'>('info');

  return (
    <div className="w-72 bg-gray-900/95 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="flex border-b border-gray-700">
        <Tab
          active={activeTab === 'info'}
          onClick={() => setActiveTab('info')}
          icon={<Info size={16} />}
          label="信息"
        />
        <Tab
          active={activeTab === 'measurement'}
          onClick={() => setActiveTab('measurement')}
          icon={<Ruler size={16} />}
          label="测量"
        />
        <Tab
          active={activeTab === 'query'}
          onClick={() => setActiveTab('query')}
          icon={<Database size={16} />}
          label="查询"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'info' && <InfoTab />}
        {activeTab === 'measurement' && <MeasurementTab />}
        {activeTab === 'query' && <QueryTab />}
      </div>

      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Crosshair size={12} />
          <span>当前工具: </span>
          <span className="text-cyan-400">
            {useAppStore.getState().toolMode === 'navigate' && '浏览模式'}
            {useAppStore.getState().toolMode === 'section' && '剖切模式'}
            {useAppStore.getState().toolMode === 'measure-distance' && '距离测量'}
            {useAppStore.getState().toolMode === 'measure-angle' && '角度测量'}
            {useAppStore.getState().toolMode === 'measure-height' && '高差测量'}
            {useAppStore.getState().toolMode === 'query' && '信息查询'}
          </span>
        </div>
      </div>
    </div>
  );
}
