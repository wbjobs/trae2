import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { LineChart, BarChart3, Calendar, Filter, AlertTriangle } from 'lucide-react';
import { Select, DatePicker, Button, Tag, Alert, Space } from 'antd';
import dayjs from 'dayjs';
import type { MonitorFactor, MonitorSection, AnomalyRange } from '../../types';
import { getFactors, getSections } from '../../api';
import { useMultiChartData, useDebouncedValue } from '../../hooks/useChartData';
import EnhancedLineChart from '../../components/charts/EnhancedLineChart';
import BarChart from '../../components/charts/BarChart';
import { dataComparator } from '../../modules/dataComparison';

const { RangePicker } = DatePicker;
const { Option } = Select;

const TrendAnalysis: React.FC = () => {
  const [factors, setFactors] = useState<MonitorFactor[]>([]);
  const [sections, setSections] = useState<MonitorSection[]>([]);
  const [selectedFactors, setSelectedFactors] = useState<string[]>(['do', 'ph']);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [searchTriggered, setSearchTriggered] = useState(false);

  const debouncedFactors = useDebouncedValue({ value: selectedFactors, delay: 300 });
  const debouncedSection = useDebouncedValue({ value: selectedSection, delay: 300 });

  const days = useMemo(() => dateRange[1].diff(dateRange[0], 'day'), [dateRange]);

  const {
    data: trendData,
    loading,
    error,
  } = useMultiChartData({
    factorIds: searchTriggered ? debouncedFactors : [],
    sectionId: debouncedSection,
    days,
    enableDownsampling: true,
    maxPoints: 500,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [factorsData, sectionsData] = await Promise.all([
          getFactors(),
          getSections(),
        ]);
        setFactors(factorsData);
        setSections(sectionsData);
        if (sectionsData.length > 0) {
          setSelectedSection(sectionsData[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };

    fetchData();
  }, []);

  const handleSearch = useCallback(() => {
    setSearchTriggered(true);
  }, []);

  const chartColors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const xAxisData = useMemo(() => {
    const firstFactor = selectedFactors[0];
    if (!firstFactor || !trendData[firstFactor]) return [];
    return trendData[firstFactor].map((d) => d.timestamp);
  }, [trendData, selectedFactors]);

  const seriesData = useMemo(() => {
    return selectedFactors.map((factorId, index) => {
      const factor = factors.find((f) => f.id === factorId);
      return {
        name: factor?.name || factorId,
        data: trendData[factorId]?.map((d) => d.value) || [],
        color: chartColors[index % chartColors.length],
      };
    });
  }, [selectedFactors, trendData, factors]);

  const comparisonData = useMemo(() => {
    return factors.slice(0, 6).map((factor, index) => ({
      name: factor.name,
      value: Math.round(70 + Math.random() * 25),
      color: chartColors[index % chartColors.length],
    }));
  }, [factors]);

  const statsData = useMemo(() => {
    return factors.slice(0, 6).map((factor) => {
      const data = trendData[factor.id];
      if (!data || data.length === 0) {
        return {
          factor,
          avg: 0,
          max: 0,
          min: 0,
          std: 0,
          passRate: 0,
          trend: 0,
        };
      }
      const values = data.map((d) => d.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
      const std = Math.sqrt(variance);
      const passRate = (values.filter((v) => v <= (factor.standardMax || 100)).length / values.length) * 100;
      const trend = dataComparator.calculateTrend(data as any);

      return { factor, avg, max, min, std, passRate, trend };
    });
  }, [trendData, factors]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-cyan-500" />
          <h3 className="text-base font-semibold text-gray-800">筛选条件</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              监测断面
            </label>
            <Select
              value={selectedSection}
              onChange={setSelectedSection}
              className="w-full"
              size="large"
            >
              {sections.map((section) => (
                <Option key={section.id} value={section.id}>
                  {section.name}
                </Option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              监测因子（多选）
            </label>
            <Select
              mode="multiple"
              value={selectedFactors}
              onChange={setSelectedFactors}
              className="w-full"
              size="large"
              maxTagCount={3}
            >
              {factors.map((factor) => (
                <Option key={factor.id} value={factor.id}>
                  {factor.name}
                </Option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              时间范围
            </label>
            <RangePicker
              value={dateRange}
              onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              className="w-full"
              size="large"
            />
          </div>
          <div className="flex items-end">
            <Button
              type="primary"
              size="large"
              className="w-full bg-cyan-500 hover:bg-cyan-600"
              onClick={handleSearch}
              loading={loading}
            >
              查询
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert
          message="数据加载失败"
          description={error}
          type="error"
          showIcon
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <LineChart className="w-5 h-5 text-cyan-500" />
              <h3 className="text-base font-semibold text-gray-800">多因子趋势对比</h3>
            </div>
            {Object.keys(trendData).length > 0 && (
              <Tag color="blue">
                {Object.values(trendData).reduce((sum, arr) => sum + arr.length, 0)} 条数据
              </Tag>
            )}
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-72">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
            </div>
          ) : xAxisData.length > 0 ? (
            <EnhancedLineChart
              data={xAxisData.map((time, i) => ({
                time,
                value: seriesData[0]?.data[i] || 0,
              }))}
              height={280}
              showDataZoom
              enableDownsampling
              maxPoints={300}
            />
          ) : (
            <div className="flex items-center justify-center h-72 text-gray-400">
              请选择监测因子并点击查询
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-cyan-500" />
            <h3 className="text-base font-semibold text-gray-800">因子达标率</h3>
          </div>
          <BarChart data={comparisonData} height={280} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-cyan-500" />
          <h3 className="text-base font-semibold text-gray-800">周对比分析</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-3">本周趋势</h4>
            <EnhancedLineChart
              data={['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, i) => ({
                time: day,
                value: [7.8, 7.5, 7.9, 8.2, 7.6, 7.4, 7.8][i],
              }))}
              height={220}
              showDataZoom={false}
              enableDownsampling={false}
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-3">上周趋势</h4>
            <EnhancedLineChart
              data={['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((day, i) => ({
                time: day,
                value: [7.2, 7.4, 7.6, 7.8, 7.5, 7.3, 7.5][i],
              }))}
              height={220}
              showDataZoom={false}
              enableDownsampling={false}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">统计数据</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-600">监测因子</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">平均值</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">最大值</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">最小值</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">标准差</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">达标率</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600">趋势</th>
              </tr>
            </thead>
            <tbody>
              {statsData.map(({ factor, avg, max, min, std, passRate, trend }) => (
                <tr key={factor.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-800">{factor.name}</td>
                  <td className="py-3 px-4 text-gray-600 font-mono">{avg.toFixed(2)}</td>
                  <td className="py-3 px-4 text-gray-600 font-mono">{max.toFixed(2)}</td>
                  <td className="py-3 px-4 text-gray-600 font-mono">{min.toFixed(2)}</td>
                  <td className="py-3 px-4 text-gray-600 font-mono">{std.toFixed(2)}</td>
                  <td className="py-3 px-4">
                    <span className={`font-medium ${passRate >= 90 ? 'text-emerald-600' : passRate >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                      {passRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 ${trend < 0 ? 'text-emerald-600' : trend > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {trend > 0 ? '↑' : trend < 0 ? '↓' : '→'}
                      {Math.abs(trend).toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TrendAnalysis;
