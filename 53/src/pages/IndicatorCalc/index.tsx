import React, { useEffect, useState } from 'react';
import { Calculator, Droplets, Leaf, Activity, Info } from 'lucide-react';
import { Select, DatePicker, Button, Card, Table, Tag, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { MonitorSection, WQIResult, TLIResult, EcoHealthResult } from '../../types';
import { getSections, calculateWQI, calculateTLI, evaluateEcoHealth } from '../../api';
import GaugeChart from '../../components/charts/GaugeChart';
import RadarChart from '../../components/charts/RadarChart';
import QualityTag from '../../components/common/QualityTag';

const { RangePicker } = DatePicker;
const { Option } = Select;

const IndicatorCalc: React.FC = () => {
  const [sections, setSections] = useState<MonitorSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs(),
  ]);
  const [wqiResult, setWqiResult] = useState<WQIResult | null>(null);
  const [tliResult, setTliResult] = useState<TLIResult | null>(null);
  const [ecoHealthResult, setEcoHealthResult] = useState<EcoHealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [calcHistory, setCalcHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const sectionsData = await getSections();
      setSections(sectionsData);
      if (sectionsData.length > 0) {
        setSelectedSection(sectionsData[0].id);
      }
    };
    fetchData();
  }, []);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const section = sections.find((s) => s.id === selectedSection);
      const [wqi, tli, ecoHealth] = await Promise.all([
        calculateWQI({
          sectionId: selectedSection,
          startDate: dateRange[0].format('YYYY-MM-DD'),
          endDate: dateRange[1].format('YYYY-MM-DD'),
        }),
        calculateTLI(25, 0.2, 1.5, 15, 1.2),
        evaluateEcoHealth({
          sectionId: selectedSection,
          wqi: 78,
          tli: 55,
          biodiversityIndex: 0.75,
          habitatScore: 80,
        }),
      ]);
      setWqiResult(wqi);
      setTliResult(tli);
      setEcoHealthResult(ecoHealth);

      const historyItem = {
        key: Date.now(),
        time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        section: section?.name,
        wqi: wqi.score.toFixed(1),
        tli: tli.score.toFixed(1),
        ecoLevel: ecoHealth.level,
      };
      setCalcHistory((prev) => [historyItem, ...prev].slice(0, 10));
    } catch (error) {
      console.error('Calculate failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const radarData = wqiResult
    ? [
        { name: '溶解氧', value: wqiResult.factorScores.do || 80 },
        { name: 'PH值', value: wqiResult.factorScores.ph || 85 },
        { name: 'COD', value: wqiResult.factorScores.cod || 70 },
        { name: '氨氮', value: wqiResult.factorScores.nh3n || 75 },
        { name: '总磷', value: wqiResult.factorScores.tp || 65 },
        { name: '总氮', value: wqiResult.factorScores.tn || 60 },
      ]
    : [];

  const historyColumns: ColumnsType<any> = [
    {
      title: '计算时间',
      dataIndex: 'time',
      key: 'time',
    },
    {
      title: '监测断面',
      dataIndex: 'section',
      key: 'section',
    },
    {
      title: 'WQI指数',
      dataIndex: 'wqi',
      key: 'wqi',
      render: (value: string) => (
        <span className="font-medium text-cyan-600">{value}</span>
      ),
    },
    {
      title: 'TLI指数',
      dataIndex: 'tli',
      key: 'tli',
      render: (value: string) => (
        <span className="font-medium text-amber-600">{value}</span>
      ),
    },
    {
      title: '生态健康',
      dataIndex: 'ecoLevel',
      key: 'ecoLevel',
      render: (level: string) => {
        const colorMap: Record<string, string> = {
          健康: 'green',
          良好: 'blue',
          一般: 'orange',
          较差: 'red',
        };
        return <Tag color={colorMap[level] || 'default'}>{level}</Tag>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-5 h-5 text-cyan-500" />
          <h3 className="text-base font-semibold text-gray-800">指标计算</h3>
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
              onClick={handleCalculate}
              loading={loading}
            >
              开始计算
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="shadow-sm border-gray-100" title={
          <div className="flex items-center gap-2">
            <Droplets className="w-4 h-4 text-cyan-500" />
            <span>水质综合指数 (WQI)</span>
          </div>
        }>
          {wqiResult ? (
            <div className="text-center">
              <GaugeChart
                value={wqiResult.score}
                max={100}
                name="WQI"
                colors={['#ef4444', '#f59e0b', '#10b981', '#0ea5e9']}
              />
              <div className="mt-4">
                <QualityTag level={wqiResult.level} showText />
              </div>
              <div className="mt-4 text-sm text-gray-500">
                <p>评价标准：GB 3838-2002</p>
                <p>计算方法：加权综合指数法</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <Info className="w-5 h-5 mr-2" />
              请先进行计算
            </div>
          )}
        </Card>

        <Card className="shadow-sm border-gray-100" title={
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-emerald-500" />
            <span>富营养化指数 (TLI)</span>
          </div>
        }>
          {tliResult ? (
            <div className="text-center">
              <GaugeChart
                value={tliResult.score}
                max={100}
                name="TLI"
                colors={['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']}
              />
              <div className="mt-4">
                <Tag color={tliResult.level === '贫营养' ? 'cyan' : tliResult.level === '中营养' ? 'blue' : tliResult.level === '轻度富营养' ? 'orange' : tliResult.level === '中度富营养' ? 'red' : 'purple'}>
                  {tliResult.level}
                </Tag>
              </div>
              <div className="mt-4 text-sm text-gray-500">
                <p>评价因子：Chla、TP、TN、COD、SD</p>
                <p>计算方法：综合营养状态指数法</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <Info className="w-5 h-5 mr-2" />
              请先进行计算
            </div>
          )}
        </Card>

        <Card className="shadow-sm border-gray-100" title={
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-rose-500" />
            <span>生态健康评估</span>
          </div>
        }>
          {ecoHealthResult ? (
            <div>
              <div className="text-center mb-4">
                <div className="text-4xl font-bold text-gray-800">
                  {ecoHealthResult.score.toFixed(1)}
                </div>
                <div className="text-sm text-gray-500 mt-1">综合健康指数</div>
                <div className="mt-3">
                  <Tag color={ecoHealthResult.level === '健康' ? 'green' : ecoHealthResult.level === '良好' ? 'blue' : ecoHealthResult.level === '一般' ? 'orange' : 'red'}>
                    {ecoHealthResult.level}
                  </Tag>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">水质状况</span>
                  <span>{ecoHealthResult.subScores.waterQuality}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">生物多样性</span>
                  <span>{ecoHealthResult.subScores.biodiversity}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">栖息地质量</span>
                  <span>{ecoHealthResult.subScores.habitat}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">生态功能</span>
                  <span>{ecoHealthResult.subScores.ecologicalFunction}%</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              <Info className="w-5 h-5 mr-2" />
              请先进行计算
            </div>
          )}
        </Card>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">因子权重分布</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <RadarChart
              data={radarData}
              height={300}
              color="#0ea5e9"
              fillColor="rgba(14, 165, 233, 0.2)"
            />
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-3">计算说明</h4>
            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <p className="font-medium text-gray-800 mb-1">WQI 计算公式</p>
                <p className="bg-gray-50 p-3 rounded font-mono text-xs">
                  WQI = Σ(Wi × Si)
                </p>
                <p className="mt-1 text-xs">Wi为权重，Si为单因子评分</p>
              </div>
              <div>
                <p className="font-medium text-gray-800 mb-1">TLI 计算公式</p>
                <p className="bg-gray-50 p-3 rounded font-mono text-xs">
                  TLI(Σ) = Σ(Wj × TLI(j))
                </p>
                <p className="mt-1 text-xs">Wj为第j种参数权重</p>
              </div>
              <div>
                <p className="font-medium text-gray-800 mb-1">健康评估指标</p>
                <p className="text-xs">包含水质、生物、栖息地、功能四个维度，采用层次分析法(AHP)确定权重</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">计算历史</h3>
        <Table
          columns={historyColumns}
          dataSource={calcHistory}
          pagination={false}
          size="small"
        />
      </div>
    </div>
  );
};

export default IndicatorCalc;
