import React, { useState, useEffect } from 'react';
import { useDataStore } from '@/store/useDataStore';
import { BarChart, PieChart } from '@/components/charts';
import PageContainer from '@/components/layout/PageContainer';
import { calcEcoIndices } from '@/services/ecoIndex';
import type { MonitoringStation } from '@/types';
import { MapPin, Thermometer, Droplets, Fish, Activity, X } from 'lucide-react';

const SpatialMap: React.FC = () => {
  const { stations, fusedData, fetchStations, fetchFusedData } = useDataStore();
  const [selectedStation, setSelectedStation] = useState<MonitoringStation | null>(null);
  const [selectedIndicator, setSelectedIndicator] = useState<string>('temperature');

  useEffect(() => {
    fetchStations();
    fetchFusedData({ page: 1, pageSize: 100 });
  }, [fetchStations, fetchFusedData]);

  const indicatorOptions = [
    { key: 'temperature', name: '水温', icon: Thermometer, unit: '°C', color: '#ef4444' },
    { key: 'totalNitrogen', name: '总氮', icon: Droplets, unit: 'mg/L', color: '#f59e0b' },
    { key: 'totalPhosphorus', name: '总磷', icon: Activity, unit: 'mg/L', color: '#8b5cf6' },
    { key: 'planktonDensity', name: '浮游生物密度', icon: Fish, unit: 'ind/L', color: '#10b981' },
  ];

  const stationPositions: Record<string, { x: number; y: number }> = {
    'station-001': { x: 18, y: 32 },
    'station-002': { x: 28, y: 28 },
    'station-003': { x: 45, y: 35 },
    'station-004': { x: 55, y: 38 },
    'station-005': { x: 72, y: 52 },
    'station-006': { x: 78, y: 58 },
    'station-007': { x: 38, y: 65 },
    'station-008': { x: 22, y: 72 },
  };

  const getIndicatorValue = (stationId: string): number => {
    if (!fusedData?.data.length) return 0;
    const stationData = fusedData.data.filter(d => d.stationId === stationId);
    if (!stationData.length) return 0;
    
    const latestData = stationData[stationData.length - 1];
    
    switch (selectedIndicator) {
      case 'temperature':
        return latestData.waterQuality.temperature;
      case 'totalNitrogen':
        return latestData.nutrient.totalNitrogen;
      case 'totalPhosphorus':
        return latestData.nutrient.totalPhosphorus;
      case 'planktonDensity':
        return latestData.plankton.reduce((sum, p) => sum + p.density, 0);
      default:
        return 0;
    }
  };

  const getColorScale = (value: number, min: number, max: number): string => {
    if (max === min) return '#60a5fa';
    const ratio = (value - min) / (max - min);
    const r = Math.round(96 + ratio * (239 - 96));
    const g = Math.round(165 + ratio * (68 - 165));
    const b = Math.round(250 - ratio * 68);
    return `rgb(${r}, ${g}, ${b})`;
  };

  const getAllValues = (): number[] => {
    return stations.map(s => getIndicatorValue(s.id));
  };

  const values = getAllValues();
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  const processAreaData = () => {
    if (!fusedData?.data.length) return [];
    
    const areaMap = new Map<string, { sum: number; count: number }>();
    
    stations.forEach(station => {
      const value = getIndicatorValue(station.id);
      const existing = areaMap.get(station.lakeArea) || { sum: 0, count: 0 };
      areaMap.set(station.lakeArea, { sum: existing.sum + value, count: existing.count + 1 });
    });
    
    return Array.from(areaMap.entries()).map(([name, data]) => ({
      name,
      value: Math.round((data.sum / data.count) * 1000) / 1000
    }));
  };

  const processSpeciesDistribution = (stationId: string) => {
    if (!fusedData?.data.length) return [];
    
    const stationData = fusedData.data.filter(d => d.stationId === stationId);
    if (!stationData.length) return [];
    
    const latestData = stationData[stationData.length - 1];
    const speciesMap = new Map<string, number>();
    
    latestData.plankton.forEach(p => {
      const existing = speciesMap.get(p.species) || 0;
      speciesMap.set(p.species, existing + p.density);
    });
    
    return Array.from(speciesMap.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  };

  const getStationDetail = (station: MonitoringStation) => {
    if (!fusedData?.data.length) return null;
    
    const stationData = fusedData.data.filter(d => d.stationId === station.id);
    if (!stationData.length) return null;
    
    const latestData = stationData[stationData.length - 1];
    const ecoIndex = calcEcoIndices(latestData);
    
    return {
      ...latestData,
      ecoIndex
    };
  };

  const currentIndicator = indicatorOptions.find(i => i.key === selectedIndicator);
  const areaData = processAreaData();
  const speciesData = selectedStation ? processSpeciesDistribution(selectedStation.id) : [];
  const stationDetail = selectedStation ? getStationDetail(selectedStation) : null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <PageContainer 
      title="空间分布分析" 
      subtitle="分析不同监测点位的水质、营养盐及浮游生物的空间分布特征"
    >
      <div className="space-y-6">
        <div className="flex flex-wrap gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#2dd4bf]" />
            选择指标：
          </span>
          {indicatorOptions.map(option => {
            const Icon = option.icon;
            return (
              <button
                key={option.key}
                onClick={() => setSelectedIndicator(option.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  selectedIndicator === option.key
                    ? 'text-white shadow-lg'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
                style={selectedIndicator === option.key ? { backgroundColor: option.color } : {}}
              >
                <Icon className="w-4 h-4" />
                {option.name}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#2dd4bf]" />
                监测点位分布图
              </h3>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#60a5fa' }} />
                <span className="text-xs text-gray-500">低</span>
                <div className="w-20 h-4 rounded-full bg-gradient-to-r from-[#60a5fa] via-[#2dd4bf] to-[#ef4444]" />
                <span className="text-xs text-gray-500">高</span>
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#ef4444' }} />
              </div>
            </div>
            
            <div className="relative w-full" style={{ height: '450px' }}>
              <svg viewBox="0 0 100 100" className="w-full h-full" style={{ borderRadius: '1rem' }}>
                <defs>
                  <linearGradient id="lakeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#e0f2fe" />
                    <stop offset="50%" stopColor="#7dd3fc" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.2" />
                  </filter>
                </defs>
                
                <rect width="100" height="100" fill="#f0f9ff" rx="10" />
                
                <ellipse cx="23" cy="30" rx="15" ry="10" fill="url(#lakeGradient)" opacity="0.8" />
                <text x="23" y="32" textAnchor="middle" fill="#1e3a5f" fontSize="3" fontWeight="bold">太湖</text>
                
                <ellipse cx="50" cy="37" rx="12" ry="8" fill="url(#lakeGradient)" opacity="0.8" />
                <text x="50" y="39" textAnchor="middle" fill="#1e3a5f" fontSize="3" fontWeight="bold">巢湖</text>
                
                <ellipse cx="75" cy="55" rx="10" ry="9" fill="url(#lakeGradient)" opacity="0.8" />
                <text x="75" y="57" textAnchor="middle" fill="#1e3a5f" fontSize="3" fontWeight="bold">滇池</text>
                
                <ellipse cx="38" cy="67" rx="13" ry="8" fill="url(#lakeGradient)" opacity="0.8" />
                <text x="38" y="69" textAnchor="middle" fill="#1e3a5f" fontSize="3" fontWeight="bold">鄱阳湖</text>
                
                <ellipse cx="22" cy="74" rx="10" ry="7" fill="url(#lakeGradient)" opacity="0.8" />
                <text x="22" y="76" textAnchor="middle" fill="#1e3a5f" fontSize="3" fontWeight="bold">洞庭湖</text>
                
                {stations.map(station => {
                  const pos = stationPositions[station.id];
                  const value = getIndicatorValue(station.id);
                  const color = getColorScale(value, minValue, maxValue);
                  const isSelected = selectedStation?.id === station.id;
                  
                  return (
                    <g key={station.id} onClick={() => setSelectedStation(station)} style={{ cursor: 'pointer' }}>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={isSelected ? 4 : 3}
                        fill={color}
                        stroke={isSelected ? '#1e3a5f' : 'white'}
                        strokeWidth={isSelected ? 1.5 : 1}
                        filter="url(#shadow)"
                        className="transition-all duration-300 hover:opacity-80"
                      />
                      {isSelected && (
                        <circle
                          cx={pos.x}
                          cy={pos.y}
                          r={6}
                          fill="none"
                          stroke="#1e3a5f"
                          strokeWidth={0.5}
                          strokeDasharray="2 2"
                          opacity="0.6"
                        >
                          <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <text
                        x={pos.x}
                        y={pos.y - 5}
                        textAnchor="middle"
                        fill="#374151"
                        fontSize="2.5"
                        fontWeight="500"
                      >
                        {station.name}
                      </text>
                      <text
                        x={pos.x}
                        y={pos.y + 8}
                        textAnchor="middle"
                        fill={color}
                        fontSize="2.8"
                        fontWeight="bold"
                      >
                        {value.toFixed(value < 1 ? 2 : 1)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {selectedStation ? `${selectedStation.name} 详情` : '点位详情'}
              </h3>
              
              {selectedStation && stationDetail ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">所属区域</div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">{selectedStation.lakeArea}</div>
                    </div>
                    <button
                      onClick={() => setSelectedStation(null)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-[#1e3a5f]/5 dark:bg-[#1e3a5f]/20 rounded-xl">
                      <div className="text-xs text-gray-500 dark:text-gray-400">水温</div>
                      <div className="text-lg font-bold text-[#1e3a5f] dark:text-white">{stationDetail.waterQuality.temperature.toFixed(1)}°C</div>
                    </div>
                    <div className="p-3 bg-[#2dd4bf]/10 dark:bg-[#2dd4bf]/20 rounded-xl">
                      <div className="text-xs text-gray-500 dark:text-gray-400">pH</div>
                      <div className="text-lg font-bold text-[#2dd4bf]">{stationDetail.waterQuality.ph.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-[#60a5fa]/10 dark:bg-[#60a5fa]/20 rounded-xl">
                      <div className="text-xs text-gray-500 dark:text-gray-400">总氮</div>
                      <div className="text-lg font-bold text-[#60a5fa]">{stationDetail.nutrient.totalNitrogen.toFixed(3)} mg/L</div>
                    </div>
                    <div className="p-3 bg-[#f59e0b]/10 dark:bg-[#f59e0b]/20 rounded-xl">
                      <div className="text-xs text-gray-500 dark:text-gray-400">总磷</div>
                      <div className="text-lg font-bold text-[#f59e0b]">{stationDetail.nutrient.totalPhosphorus.toFixed(3)} mg/L</div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-r from-[#1e3a5f]/5 to-[#2dd4bf]/5 dark:from-[#1e3a5f]/20 dark:to-[#2dd4bf]/20 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Shannon指数</span>
                      <span className="text-lg font-bold text-[#2dd4bf]">{stationDetail.ecoIndex.shannonIndex.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Simpson指数</span>
                      <span className="text-lg font-bold text-[#60a5fa]">{stationDetail.ecoIndex.simpsonIndex.toFixed(3)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">水质等级</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        stationDetail.ecoIndex.waterQualityLevel === 'excellent' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400' :
                        stationDetail.ecoIndex.waterQualityLevel === 'good' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400' :
                        stationDetail.ecoIndex.waterQualityLevel === 'moderate' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400' :
                        stationDetail.ecoIndex.waterQualityLevel === 'poor' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400' :
                        'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
                      }`}>
                        {stationDetail.ecoIndex.waterQualityLevel === 'excellent' ? '优' :
                         stationDetail.ecoIndex.waterQualityLevel === 'good' ? '良好' :
                         stationDetail.ecoIndex.waterQualityLevel === 'moderate' ? '中度' :
                         stationDetail.ecoIndex.waterQualityLevel === 'poor' ? '较差' : '极差'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    更新时间：{formatDate(selectedStation.lastUpdate)}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>点击地图上的点位查看详情</p>
                </div>
              )}
            </div>

            {selectedStation && speciesData.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">物种分布</h3>
                <PieChart
                  data={speciesData}
                  height={250}
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            区域{currentIndicator?.name}对比
            <span className="text-sm font-normal text-gray-500 ml-2">（单位：{currentIndicator?.unit}）</span>
          </h3>
          <BarChart
            data={areaData}
            color="#2dd4bf"
            height={300}
          />
        </div>
      </div>
    </PageContainer>
  );
};

export default SpatialMap;
