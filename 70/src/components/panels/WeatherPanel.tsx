import { Cloud, Sun, CloudRain, CloudLightning, Snowflake, Thermometer, Wind } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';
import { WeatherType, WEATHER_CONFIG } from '../../../shared/types';

const weatherIcons: Record<WeatherType, React.ReactNode> = {
  sunny: <Sun className="w-6 h-6 text-yellow-400" />,
  cloudy: <Cloud className="w-6 h-6 text-slate-400" />,
  rainy: <CloudRain className="w-6 h-6 text-blue-400" />,
  stormy: <CloudLightning className="w-6 h-6 text-yellow-500" />,
  snowy: <Snowflake className="w-6 h-6 text-blue-200" />,
  frosty: <Thermometer className="w-6 h-6 text-cyan-400" />,
};

export function WeatherPanel() {
  const { gameState } = useGameStore();

  if (!gameState) return null;

  const weatherConfig = WEATHER_CONFIG[gameState.weather];

  return (
    <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg p-4">
      <div className="flex items-center gap-3 mb-3">
        {weatherIcons[gameState.weather]}
        <div>
          <div className="text-white font-bold text-lg">{weatherConfig.name}</div>
          <div className="text-slate-400 text-xs">
            强度: {(gameState.weatherIntensity * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      
      <div className="w-full bg-slate-700 rounded-full h-2 mb-3">
        <div 
          className="h-2 rounded-full bg-blue-500 transition-all"
          style={{ width: `${gameState.weatherIntensity * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-700/50 rounded p-2">
          <div className="text-slate-400">故障倍率</div>
          <div className="text-white font-medium">{weatherConfig.faultMultiplier}x</div>
        </div>
        <div className="bg-slate-700/50 rounded p-2">
          <div className="text-slate-400">损耗速率</div>
          <div className="text-white font-medium">{weatherConfig.healthDecayRate}/s</div>
        </div>
      </div>
    </div>
  );
}
