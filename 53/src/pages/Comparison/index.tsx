import React, { useEffect, useState, useMemo } from 'react';
import { GitCompare, BarChart3, TrendingUp, AlertTriangle } from 'lucide-react';
import { Select, DatePicker, Button, Card, Tag, Table, Space, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { MonitorFactor, MonitorSection, ComparisonData, AnomalyRange } from '../../types';
import { getFactors, getSections, getMultiTrendData } from '../../api';
import EnhancedLineChart from '../../components/charts/EnhancedLineChart';
import BarChart from '../../components/charts/BarChart';
import { dataComparator } from '../../modules/dataComparison';
import { anomalyDetector } from '../../modules/anomalyDetection';
import { performanceOptimizer } from '../../modules/performance';

const { RangePicker } = DatePicker;
const { Option } = Select;

const Comparison: React.FC = () => {
  const [factors, setFactors] = useState<MonitorFactor[]>([]);
  const [sections, setSections] = useState<MonitorSection[]>([]);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [selectedFactor, setSelectedFactor] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [loading, setLoading] = useState(false);
  const [comparisonData, setComparisonData] = useState<ComparisonData[]>([]);
  const [anomalyRanges, setAnomalyRanges] = useState<AnomalyRange[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [factorsData, sectionsData] = await Promise.all([
        getFactors(),
        getSections(),
      ]);
      setFactors(factorsData);
      setSections(sectionsData);
      if (sectionsData.length >= 2) {
        setSelectedSections([sectionsData[0].id, sectionsData[1].id]);
      }
      if (factorsData.length > 0) {
        setSelectedFactor(factorsData[0].id);
      }
    };
    fetchData();
  }, []);

  const handleCompare = async () => {
    if (selectedSections.length < 2 || !selectedFactor) return;

    setLoading(true);
    try {
      const days = dateRange[1].diff(dateRange[0], 'day');
      const allTrendData = await getMultiTrendData(
        [selectedFactor],
        selectedSections[0],
        days
      );

      const mockComparisonData: ComparisonData[] = selectedSections.map((sectionId) => {
        const section = sections.find((s) => s.id === sectionId);
        const factor = factors.find((f) => f.id === selectedFactor);
        const baseValue = 50 + Math.random() * 30;

        return {
          sectionId,
          sectionName: section?.name || sectionId,
          factorId: selectedFactor,
          factorName: factor?.name || selectedFactor,
          avgValue: baseValue + Math.random() * 10,
          maxValue: baseValue + 20 + Math.random() * 10,
          minValue: baseValue - 10 - Math.random() * 10,
          stdDev: 5 + Math.random() * 5,
          exceedRate: Math.random() * 30,
          trend: (Math.random() - 0.5) * 10,
          dataPoints: allTrendData[selectedFactor]?.map((d) => ({
            ...d,
            value: d.value + (Math.random() - 0.5) * 10,
            sectionId,
          })) || [],
        };
      });

      setComparisonData(mockComparisonData);

      const allAnomalies: AnomalyRange[] = [];
      mockComparisonData.forEach((data) => {
        const mockData = data.dataPoints.map((d) => ({
          id: d.timestamp,
          sectionId: data.sectionId,
          sectionName: data.sectionName,
          factorId: data.factorId,
          factorName: data.factorName,
          value: d.value,
          unit: factor?.unit || '',
          timestamp: d.timestamp,
          quality: 'good',
          dataStatus: 'valid',
          standardValue: factor?.standardMin || 0,
        }));
        const anomalies = anomalyDetector.detectAllAnomalies(mockData as any, {
          threshold: 40,
          windowSize: 5,
        });
        allAnomalies.push(...anomalies);
      });
      setAnomalyRanges(allAnomalies);
    } catch (error) {
      console.error('Comparison failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const chartColors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const comparisonReport = useMemo(() => {
    if (comparisonData.length === 0) return null;
    return dataComparator.generateComparisonReport(comparisonData);
  }, [comparisonData]);

  const columns: ColumnsType<ComparisonData> = [
    {
      title: '断面名称',
      dataIndex: 'sectionName',
      key: 'sectionName',
      render: (text, record) => (
        <Space>
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{
              backgroundColor:
                chartColors[comparisonData.findIndex((d) => d.sectionId === record.sectionId) % chartColors.length],
            }}
          ></span>
          <span className="font-medium">{text}</span>
        </Space>
      ),
    },
    {
      title: '平均值',
      dataIndex: 'avgValue',
      key: 'avgValue',
      render: (value) => value.toFixed(2),
      sorter: (a, b) => a.avgValue - b.avgValue,
    },
    {
      title: '最大值',
      dataIndex: 'maxValue',
      key: 'maxValue',
      render: (value) => value.toFixed(2),
    },
    {
      title: '最小值',
      dataIndex: 'minValue',
      key: 'minValue',
      render: (value) => value.toFixed(2),
    },
    {
      title: '标准差',
      dataIndex: 'stdDev',
      key: 'stdDev',
      render: (value) => value.toFixed(2),
    },
    {
      title: '超标率',
      dataIndex: 'exceedRate',
      key: 'exceedRate',
      render: (value) => (
        <Tag color={value > 20 ? 'red' : value > 10 ? 'orange' : 'green'}>
          {value.toFixed(1)}%
        </Tag>
      ),
      sorter: (a, b) => a.exceedRate - b.exceedRate,
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      render: (value) => (
        <span className={value < 0 ? 'text-emerald-600' : value > 0 ? 'text-red-600' : 'text-gray-600'}>
          {value > 0 ? '↑' : value < 0 ? '↓' : '→'} {Math.abs(value).toFixed(1)}%
        </span>
      ),
    },
  ];

  const trendChartData = useMemo(() => {
    if (comparisonData.length === 0) return { xAxis: [], series: [] };

    const allTimestamps = new Set<string>();
    comparisonData.forEach((data) => {
      data.dataPoints.forEach((d) => allTimestamps.add(d.timestamp));
    });
    const xAxis = Array.from(allTimestamps).sort();

    const series = comparisonData.map((data, index) => {
      const values = xAxis.map((ts) => {
        const point = data.dataPoints.find((d) => d.timestamp === ts);
        return point ? point.value : null;
      });
      return {
        name: data.sectionName,
        data: values,
        color: chartColors[index % chartColors.length],
      };
    });

    return { xAxis, series };
  }, [comparisonData]);

  const barChartData = useMemo(() => {
    return comparisonData.map((data, index) => ({
      name: data.sectionName,
      value: Math.round(data.avgValue),
      color: chartColors[index % chartColors.length],
    }));
  }, [comparisonData]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="w-5 h-5 text-cyan-500" />
          <h3 className="text-base font-semibold text-gray-800">跨断面数据对比</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              选择断面（多选）
            </label>
            <Select
              mode="multiple"
              value={selectedSections}
              onChange={setSelectedSections}
              className="w-full"
              size="large"
              maxTagCount={3}
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
              监测因子
            </label>
            <Select
              value={selectedFactor}
              onChange={setSelectedFactor}
              className="w-full"
              size="large"
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
              onClick={handleCompare}
              loading={loading}
              icon={<GitCompare className="w-4 h-4" />}
            >
              开始对比
            </Button>
          </div>
        </div>
      </div>

      {comparisonReport && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="shadow-sm border-gray-100">
            <div className="text-center">
              <p className="text-sm text-gray-500">对比断面数</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{comparisonReport.totalSections}</p>
            </div>
          </Card>
          <Card className="shadow-sm border-gray-100">
            <div className="text-center">
              <p className="text-sm text-gray-500">平均超标率</p>
              <p className="text-2xl font-bold text-amber-600 mt-1">{comparisonReport.avgExceedRate.toFixed(1)}%</p>
            </div>
          </Card>
          <Card className="shadow-sm border-gray-100">
            <div className="text-center">
              <p className="text-sm text-gray-500">改善趋势</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{comparisonReport.improvingCount}</p>
            </div>
          </Card>
          <Card className="shadow-sm border-gray-100">
            <div className="text-center">
              <p className="text-sm text-gray-500">恶化趋势</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{comparisonReport.worseningCount}</p>
            </div>
          </Card>
        </div>
      )}

      {anomalyRanges.length > 0 && (
        <Alert
          message={`检测到 ${anomalyRanges.length} 个异常区间`}
          description="高/中风险区间已在图表中标注"
          type="warning"
          showIcon
          icon={<AlertTriangle className="w-5 h-5" />}
        />
      )}

      {comparisonData.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card
              className="shadow-sm border-gray-100"
              title={
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-500" />
                  <span>趋势对比</span>
                </div>
              }
            >
              <EnhancedLineChart
                data={trendChartData.series[0]?.data.map((v, i) => ({
                  time: trendChartData.xAxis[i],
                  value: v || 0,
                })) || []}
                height={300}
                showDataZoom
                anomalyRanges={anomalyRanges}
                enableDownsampling
                maxPoints={300}
              />
            </Card>

            <Card
              className="shadow-sm border-gray-100"
              title={
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-500" />
                  <span>平均值对比</span>
                </div>
              }
            >
              <BarChart data={barChartData} height={300} />
            </Card>
          </div>

          <Card className="shadow-sm border-gray-100">
            <h3 className="text-base font-semibold text-gray-800 mb-4">详细对比数据</h3>
            <Table
              columns={columns}
              dataSource={comparisonData}
              rowKey="sectionId"
              pagination={false}
            />
          </Card>

          {anomalyRanges.length > 0 && (
            <Card className="shadow-sm border-gray-100">
              <h3 className="text-base font-semibold text-gray-800 mb-4">异常区间列表</h3>
              <div className="space-y-2">
                {anomalyRanges.slice(0, 10).map((anomaly) => (
                  <div
                    key={anomaly.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle
                        className={`w-5 h-5 ${
                          anomaly.severity === 'high'
                            ? 'text-red-500'
                            : anomaly.severity === 'medium'
                            ? 'text-amber-500'
                            : 'text-emerald-500'
                        }`}
                      />
                      <div>
                        <p className="font-medium text-gray-800">
                          {anomaly.sectionName} - {anomaly.factorName}
                        </p>
                        <p className="text-sm text-gray-500">
                          {dayjs(anomaly.startTime).format('YYYY-MM-DD HH:mm')} ~{' '}
                          {dayjs(anomaly.endTime).format('YYYY-MM-DD HH:mm')}
                        </p>
                      </div>
                    </div>
                    <Space>
                      <Tag
                        color={
                          anomaly.type === 'exceed_standard'
                            ? 'red'
                            : anomaly.type === 'sudden_change'
                            ? 'orange'
                            : anomaly.type === 'missing_data'
                            ? 'blue'
                            : 'purple'
                        }
                      >
                        {anomaly.type === 'exceed_standard'
                          ? '超标'
                          : anomaly.type === 'sudden_change'
                          ? '突变'
                          : anomaly.type === 'missing_data'
                          ? '缺失'
                          : '趋势异常'}
                      </Tag>
                      <Tag
                        color={
                          anomaly.severity === 'high'
                            ? 'red'
                            : anomaly.severity === 'medium'
                            ? 'orange'
                            : 'green'
                        }
                      >
                        {anomaly.severity === 'high' ? '高' : anomaly.severity === 'medium' ? '中' : '低'}
                      </Tag>
                    </Space>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default Comparison;
