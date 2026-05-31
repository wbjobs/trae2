import { useDashboardStore } from '../../store/dashboardStore';
import { formatNumber, getTrendIcon, getTrendColor } from '../../utils/format';
import { Thermometer, Droplets, Wind, Flame } from 'lucide-react';

const RealtimeCards = () => {
  const { features, realtimeData } = useDashboardStore();

  const latestData = realtimeData[realtimeData.length - 1];

  const cards = [
    {
      title: '温度',
      unit: '°C',
      value: latestData?.temperature || 0,
      feature: features?.temperature,
      icon: Thermometer,
      color: '#ff6b35',
      max: 40,
      min: 15,
    },
    {
      title: '湿度',
      unit: '%',
      value: latestData?.humidity || 0,
      feature: features?.humidity,
      icon: Droplets,
      color: '#00d4ff',
      max: 80,
      min: 30,
    },
    {
      title: 'CO₂ 浓度',
      unit: 'ppm',
      value: latestData?.gasConcentration.co2 || 0,
      feature: features?.co2,
      icon: Wind,
      color: '#9c27b0',
      max: 2500,
      min: 400,
    },
    {
      title: 'CH₄ 浓度',
      unit: '%LEL',
      value: latestData?.gasConcentration.ch4 || 0,
      feature: features?.ch4,
      icon: Flame,
      color: '#ff3366',
      max: 100,
      min: 0,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const percentage = ((card.value - card.min) / (card.max - card.min)) * 100;
        return (
          <div
            key={card.title}
            className="relative bg-gradient-to-br from-[#0d1f3c]/80 to-[#0a1628]/80 rounded-xl p-5 border border-[#00d4ff]/20 overflow-hidden backdrop-blur-sm"
          >
            <div
              className="absolute top-0 left-0 w-full h-1 opacity-50"
              style={{ backgroundColor: card.color }}
            />
            
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-[#8aa4c4] text-sm mb-1">{card.title}</p>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-3xl font-bold font-mono"
                    style={{ color: card.color }}
                  >
                    {formatNumber(card.value, card.title.includes('CH₄') ? 2 : 1)}
                  </span>
                  <span className="text-[#8aa4c4] text-sm">{card.unit}</span>
                </div>
              </div>
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${card.color}20` }}
              >
                <Icon className="w-6 h-6" style={{ color: card.color }} />
              </div>
            </div>

            <div className="h-2 bg-[#0a1628] rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(100, Math.max(0, percentage))}%`,
                  backgroundColor: card.color,
                  boxShadow: `0 0 10px ${card.color}50`,
                }}
              />
            </div>

            {card.feature && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#5a7a9a]">
                  均值: {formatNumber(card.feature.mean, 1)}
                </span>
                <span
                  className="font-mono font-bold"
                  style={{ color: getTrendColor(card.feature.trend) }}
                >
                  {getTrendIcon(card.feature.trend)} {card.feature.trend === 'rising' ? '上升' : card.feature.trend === 'falling' ? '下降' : '稳定'}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default RealtimeCards;
