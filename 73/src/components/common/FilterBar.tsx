import React, { useState } from 'react';
import { Search, RotateCcw, Filter, Calendar, MapPin, Fish, Gauge } from 'lucide-react';
import type { MonitoringStation, PlanktonCategory } from '@/types';

interface FilterBarProps {
  stations: MonitoringStation[];
  onFilterChange: (filters: any) => void;
  className?: string;
}

const speciesOptions = ['小球藻', '硅藻', '蓝藻', '绿藻', '轮虫', '枝角类', '桡足类'];
const categoryOptions: { value: PlanktonCategory; label: string }[] = [
  { value: 'phytoplankton', label: '浮游植物' },
  { value: 'zooplankton', label: '浮游动物' },
];
const indicatorOptions = [
  { value: 'temperature', label: '水温' },
  { value: 'ph', label: 'pH值' },
  { value: 'dissolvedOxygen', label: '溶解氧' },
  { value: 'conductivity', label: '电导率' },
  { value: 'turbidity', label: '浊度' },
  { value: 'totalNitrogen', label: '总氮' },
  { value: 'totalPhosphorus', label: '总磷' },
  { value: 'ammoniaNitrogen', label: '氨氮' },
];

const FilterBar: React.FC<FilterBarProps> = ({ stations, onFilterChange, className = '' }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedStations, setSelectedStations] = useState<string[]>([]);
  const [selectedSpecies, setSelectedSpecies] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<PlanktonCategory[]>([]);
  const [selectedIndicators, setSelectedIndicators] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleStationToggle = (stationId: string) => {
    setSelectedStations((prev) =>
      prev.includes(stationId)
        ? prev.filter((id) => id !== stationId)
        : [...prev, stationId]
    );
  };

  const handleSpeciesToggle = (species: string) => {
    setSelectedSpecies((prev) =>
      prev.includes(species)
        ? prev.filter((s) => s !== species)
        : [...prev, species]
    );
  };

  const handleCategoryToggle = (category: PlanktonCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  };

  const handleIndicatorToggle = (indicator: string) => {
    setSelectedIndicators((prev) =>
      prev.includes(indicator)
        ? prev.filter((i) => i !== indicator)
        : [...prev, indicator]
    );
  };

  const handleApply = () => {
    onFilterChange({
      dateRange: startDate && endDate ? [startDate, endDate] : undefined,
      stationIds: selectedStations.length > 0 ? selectedStations : undefined,
      species: selectedSpecies.length > 0 ? selectedSpecies : undefined,
      categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      indicators: selectedIndicators.length > 0 ? selectedIndicators : undefined,
    });
  };

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    setSelectedStations([]);
    setSelectedSpecies([]);
    setSelectedCategories([]);
    setSelectedIndicators([]);
    onFilterChange({});
  };

  const activeFilterCount =
    (startDate && endDate ? 1 : 0) +
    (selectedStations.length > 0 ? 1 : 0) +
    (selectedSpecies.length > 0 ? 1 : 0) +
    (selectedCategories.length > 0 ? 1 : 0) +
    (selectedIndicators.length > 0 ? 1 : 0);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm ${className}`}>
      <div
        className="flex items-center justify-between px-6 py-4 cursor-pointer border-b border-gray-100 dark:border-gray-700"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#1e3a5f]/10 rounded-xl">
            <Filter className="w-5 h-5 text-[#1e3a5f]" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">筛选条件</h3>
            {activeFilterCount > 0 && (
              <span className="text-xs text-[#2dd4bf]">已选择 {activeFilterCount} 个条件</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <span className="px-2.5 py-1 bg-[#f97316]/10 text-[#f97316] text-xs font-medium rounded-full">
              {activeFilterCount}
            </span>
          )}
          <button
            type="button"
            className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Calendar className="w-4 h-4 text-[#60a5fa]" />
              日期范围
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2dd4bf] focus:border-transparent"
              />
              <span className="text-gray-400">至</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2dd4bf] focus:border-transparent"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <MapPin className="w-4 h-4 text-[#f97316]" />
              监测点位
            </label>
            <div className="flex flex-wrap gap-2">
              {stations.map((station) => (
                <button
                  key={station.id}
                  type="button"
                  onClick={() => handleStationToggle(station.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedStations.includes(station.id)
                      ? 'bg-[#1e3a5f] text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {station.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Fish className="w-4 h-4 text-[#2dd4bf]" />
              物种类别
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {categoryOptions.map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => handleCategoryToggle(category.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedCategories.includes(category.value)
                      ? 'bg-[#2dd4bf] text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {speciesOptions.map((species) => (
                <button
                  key={species}
                  type="button"
                  onClick={() => handleSpeciesToggle(species)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                    selectedSpecies.includes(species)
                      ? 'bg-[#60a5fa] text-white'
                      : 'bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {species}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Gauge className="w-4 h-4 text-[#1e3a5f]" />
              指标类型
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {indicatorOptions.map((indicator) => (
                <button
                  key={indicator.value}
                  type="button"
                  onClick={() => handleIndicatorToggle(indicator.value)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                    selectedIndicators.includes(indicator.value)
                      ? 'bg-gradient-to-r from-[#1e3a5f] to-[#2dd4bf] text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {indicator.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              重置
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#1e3a5f] to-[#2dd4bf] hover:shadow-lg hover:shadow-[#2dd4bf]/30 transition-all"
            >
              <Search className="w-4 h-4" />
              应用筛选
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export { FilterBar };
