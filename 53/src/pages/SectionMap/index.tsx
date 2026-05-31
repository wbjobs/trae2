import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import {
  MapPin,
  Droplets,
  Thermometer,
  Activity,
  Info,
} from 'lucide-react';
import type { MonitorSection, SectionRealtimeData } from '../../types';
import { getSections, getRealtimeData } from '../../api';
import QualityTag from '../../components/common/QualityTag';

const customIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="background-color: ${color}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
      <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const getQualityColor = (quality: string): string => {
  switch (quality) {
    case 'excellent':
      return '#10b981';
    case 'good':
      return '#0ea5e9';
    case 'moderate':
      return '#f59e0b';
    case 'poor':
      return '#ef4444';
    default:
      return '#6b7280';
  }
};

const SectionMap: React.FC = () => {
  const [sections, setSections] = useState<MonitorSection[]>([]);
  const [realtimeData, setRealtimeData] = useState<SectionRealtimeData[]>([]);
  const [selectedSection, setSelectedSection] = useState<SectionRealtimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sectionsData, realtime] = await Promise.all([
          getSections(),
          getRealtimeData(),
        ]);
        setSections(sectionsData);
        setRealtimeData(realtime);
      } catch (error) {
        console.error('Failed to fetch section data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  const center: [number, number] = [31.9, 118.8];

  const getSectionRealtimeData = (sectionId: string) => {
    return realtimeData.find((d) => d.section.id === sectionId);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-cyan-500" />
                流域监测断面分布
              </h3>
            </div>
            <div className="h-[500px] relative">
              <MapContainer
                ref={mapRef}
                center={center}
                zoom={10}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {sections.map((section) => {
                  const data = getSectionRealtimeData(section.id);
                  const quality = data?.overallQuality || 'good';
                  return (
                    <React.Fragment key={section.id}>
                      <Marker
                        position={[section.latitude, section.longitude]}
                        icon={customIcon(getQualityColor(quality))}
                        eventHandlers={{
                          click: () => setSelectedSection(data || null),
                        }}
                      >
                        <Popup>
                          <div className="min-w-[200px]">
                            <h4 className="font-semibold text-gray-800 mb-2">
                              {section.name}
                            </h4>
                            <p className="text-sm text-gray-500 mb-2">
                              {section.riverName}
                            </p>
                            {data && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span>水质等级:</span>
                                  <QualityTag quality={data.overallQuality} size="sm" />
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                  <span>WQI:</span>
                                  <span className="font-semibold">{data.wqi}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                      <Circle
                        key={`${section.id}-circle`}
                        center={[section.latitude, section.longitude]}
                        radius={2000}
                        pathOptions={{
                          color: getQualityColor(quality),
                          fillColor: getQualityColor(quality),
                          fillOpacity: 0.15,
                          weight: 2,
                        }}
                      />
                    </React.Fragment>
                  );
                })}
              </MapContainer>

              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-lg p-3 z-[1000]">
                <h4 className="text-xs font-semibold text-gray-700 mb-2">图例</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span className="text-xs text-gray-600">优</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-sky-500"></span>
                    <span className="text-xs text-gray-600">良</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                    <span className="text-xs text-gray-600">轻度污染</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500"></span>
                    <span className="text-xs text-gray-600">重度污染</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-cyan-500" />
              断面详情
            </h3>
            {selectedSection ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-800">
                    {selectedSection.section.name}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {selectedSection.section.riverName}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {selectedSection.section.address}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">水质等级</span>
                  <QualityTag quality={selectedSection.overallQuality} />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">综合WQI</span>
                  <span className="text-xl font-bold text-gray-800">
                    {selectedSection.wqi}
                  </span>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-3">监测因子</h5>
                  <div className="space-y-2">
                    {selectedSection.factors.slice(0, 6).map((factor) => (
                      <div
                        key={factor.factor.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-600">{factor.factor.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-800">
                            {factor.value.toFixed(2)}
                          </span>
                          <span className="text-gray-400 text-xs">
                            {factor.factor.unit}
                          </span>
                          <QualityTag quality={factor.quality} size="sm" showText={false} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">点击地图上的断面查看详情</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-500" />
              监测断面统计
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">监测断面总数</span>
                <span className="font-semibold text-gray-800">{sections.length} 个</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">国家级断面</span>
                <span className="font-semibold text-gray-800">
                  {sections.filter((s) => s.level === 'national').length} 个
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">省级断面</span>
                <span className="font-semibold text-gray-800">
                  {sections.filter((s) => s.level === 'provincial').length} 个
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">市级断面</span>
                <span className="font-semibold text-gray-800">
                  {sections.filter((s) => s.level === 'city').length} 个
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">断面列表</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-600">断面名称</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">所属河流</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">断面级别</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">水质等级</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">WQI</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">溶解氧</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">PH值</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">更新时间</th>
              </tr>
            </thead>
            <tbody>
              {realtimeData.map((item) => {
                const doFactor = item.factors.find((f) => f.factor.id === 'do');
                const phFactor = item.factors.find((f) => f.factor.id === 'ph');
                return (
                  <tr
                    key={item.section.id}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedSection(item)}
                  >
                    <td className="py-3 px-4 font-medium text-gray-800">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-cyan-500" />
                        {item.section.name}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{item.section.riverName}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {item.section.level === 'national'
                        ? '国家级'
                        : item.section.level === 'provincial'
                        ? '省级'
                        : item.section.level === 'city'
                        ? '市级'
                        : '县级'}
                    </td>
                    <td className="py-3 px-4">
                      <QualityTag quality={item.overallQuality} size="sm" />
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-800">{item.wqi}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {doFactor?.value.toFixed(2)} mg/L
                    </td>
                    <td className="py-3 px-4 text-gray-600">
                      {phFactor?.value.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs">
                      {doFactor?.updateTime}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SectionMap;
