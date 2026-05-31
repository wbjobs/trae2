import React, { useEffect, useState } from 'react';
import { FileText, FileSpreadsheet, Download, Calendar, CheckCircle2 } from 'lucide-react';
import { Select, DatePicker, Button, Card, List, Tag, message, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import dayjs from 'dayjs';
import type { MonitorSection, ReportData } from '../../types';
import { getSections, generateReport } from '../../api';
import { ReportExporter } from '../../modules/export';

const { RangePicker } = DatePicker;
const { Option } = Select;

const ReportCenter: React.FC = () => {
  const [sections, setSections] = useState<MonitorSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs(),
  ]);
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('daily');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportHistory, setReportHistory] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const sectionsData = await getSections();
      setSections(sectionsData);
      if (sectionsData.length > 0) {
        setSelectedSection(sectionsData[0].id);
      }
    };
    fetchData();

    setReportHistory([
      {
        id: 1,
        name: '2024年1月水质监测日报',
        type: '日报',
        createTime: '2024-01-15 10:30:00',
        status: 'completed',
      },
      {
        id: 2,
        name: '2024年第2周水质监测周报',
        type: '周报',
        createTime: '2024-01-14 16:45:00',
        status: 'completed',
      },
      {
        id: 3,
        name: '2023年12月水质监测月报',
        type: '月报',
        createTime: '2024-01-02 09:00:00',
        status: 'completed',
      },
    ]);
  }, []);

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const section = sections.find((s) => s.id === selectedSection);
      const data = await generateReport({
        sectionId: selectedSection,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        reportType,
      });
      setReportData(data);
      message.success('报表生成成功');
    } catch (error) {
      console.error('Generate report failed:', error);
      message.error('报表生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!reportData) return;
    const exporter = new ReportExporter();
    const blob = exporter.exportFullReportToExcel(reportData, []);
    exporter.downloadFile(blob, `${reportData.title}.xlsx`);
    message.success('Excel导出成功');
  };

  const handleExportPDF = () => {
    if (!reportData) return;
    const exporter = new ReportExporter();
    const blob = exporter.exportReportDataToPDF(reportData);
    exporter.downloadFile(blob, `${reportData.title}.pdf`);
    message.success('PDF导出成功');
  };

  const reportTemplates = [
    {
      id: 'daily',
      name: '日报模板',
      description: '包含当日监测数据、异常告警、趋势分析',
      icon: '📊',
    },
    {
      id: 'weekly',
      name: '周报模板',
      description: '包含周统计、对比分析、问题汇总',
      icon: '📈',
    },
    {
      id: 'monthly',
      name: '月报模板',
      description: '包含月总结、趋势预测、建议措施',
      icon: '📉',
    },
    {
      id: 'custom',
      name: '自定义模板',
      description: '根据选择的时间范围生成报表',
      icon: '📋',
    },
  ];

  const tabItems: TabsProps['items'] = [
    {
      key: 'generate',
      label: '生成报表',
      children: (
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-4">选择报表模板</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {reportTemplates.map((template) => (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${reportType === template.id ? 'border-cyan-500 ring-2 ring-cyan-200' : ''}`}
                  onClick={() => setReportType(template.id as any)}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-2">{template.icon}</div>
                    <h5 className="font-medium text-gray-800">{template.name}</h5>
                    <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-5">
            <h4 className="text-sm font-medium text-gray-700 mb-4">配置报表参数</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  onClick={handleGenerateReport}
                  loading={loading}
                  icon={<FileText className="w-4 h-4" />}
                >
                  生成报表
                </Button>
              </div>
            </div>
          </div>

          {reportData && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{reportData.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    生成时间：{reportData.generatedAt} | 统计周期：{reportData.period}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    size="large"
                    icon={<FileSpreadsheet className="w-4 h-4" />}
                    onClick={handleExportExcel}
                  >
                    导出Excel
                  </Button>
                  <Button
                    size="large"
                    icon={<FileText className="w-4 h-4" />}
                    onClick={handleExportPDF}
                  >
                    导出PDF
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-cyan-50 rounded-lg p-4">
                  <p className="text-sm text-cyan-600">监测断面数</p>
                  <p className="text-2xl font-bold text-cyan-700 mt-1">
                    {reportData.summary.totalSections}
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-4">
                  <p className="text-sm text-emerald-600">数据总量</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {reportData.summary.totalRecords}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-sm text-amber-600">平均WQI</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">
                    {reportData.summary.avgWQI.toFixed(1)}
                  </p>
                </div>
                <div className="bg-rose-50 rounded-lg p-4">
                  <p className="text-sm text-rose-600">异常数</p>
                  <p className="text-2xl font-bold text-rose-700 mt-1">
                    {reportData.summary.anomalies}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">一、数据概况</h5>
                  <p className="text-sm text-gray-600">
                    本期报表共统计了{reportData.summary.totalSections}个监测断面的
                    {reportData.summary.totalRecords}条监测数据。其中，水质达标断面
                    {Math.round(reportData.summary.totalSections * 0.85)}个，达标率
                    {(0.85 * 100).toFixed(1)}%。
                  </p>
                </div>
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">二、水质评价</h5>
                  <p className="text-sm text-gray-600">
                    本期综合水质指数(WQI)为{reportData.summary.avgWQI.toFixed(1)}，
                    整体水质状况{reportData.summary.avgWQI >= 80 ? '优良' : reportData.summary.avgWQI >= 60 ? '一般' : '较差'}。
                    主要超标因子为总氮、总磷，需加强关注。
                  </p>
                </div>
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">三、趋势分析</h5>
                  <p className="text-sm text-gray-600">
                    与上期相比，溶解氧浓度上升2.3%，COD浓度下降1.5%，
                    氨氮浓度基本持平。整体水质呈稳中向好趋势。
                  </p>
                </div>
                <div>
                  <h5 className="font-medium text-gray-700 mb-2">四、建议措施</h5>
                  <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                    <li>加强总氮、总磷超标断面的巡查频次</li>
                    <li>建议开展流域污染源排查工作</li>
                    <li>继续推进水环境综合治理工程</li>
                    <li>完善监测预警机制建设</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'history',
      label: '报表历史',
      children: (
        <div>
          <List
            dataSource={reportHistory}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="download"
                    size="small"
                    icon={<Download className="w-3 h-3" />}
                  >
                    下载
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FileText className="w-8 h-8 text-cyan-500" />}
                  title={
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      <Tag color="blue">{item.type}</Tag>
                    </div>
                  }
                  description={
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.createTime}
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" />
                        已完成
                      </span>
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </div>
      ),
    },
    {
      key: 'schedule',
      label: '定时任务',
      children: (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-medium text-gray-800">每日自动生成日报</h5>
                <p className="text-sm text-gray-500 mt-1">每天00:00自动生成前一天的日报</p>
              </div>
              <Tag color="green">已启用</Tag>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-medium text-gray-800">每周自动生成周报</h5>
                <p className="text-sm text-gray-500 mt-1">每周一00:00自动生成上一周的周报</p>
              </div>
              <Tag color="green">已启用</Tag>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-medium text-gray-800">每月自动生成月报</h5>
                <p className="text-sm text-gray-500 mt-1">每月1日00:00自动生成上一月的月报</p>
              </div>
              <Tag color="green">已启用</Tag>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h5 className="font-medium text-gray-800">季度自动生成季报</h5>
                <p className="text-sm text-gray-500 mt-1">每季度第一天00:00自动生成上一季度的季报</p>
              </div>
              <Tag color="default">未启用</Tag>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm border-gray-100">
          <div className="text-center">
            <FileText className="w-8 h-8 text-cyan-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-800">156</p>
            <p className="text-sm text-gray-500">累计生成报表</p>
          </div>
        </Card>
        <Card className="shadow-sm border-gray-100">
          <div className="text-center">
            <FileSpreadsheet className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-800">12</p>
            <p className="text-sm text-gray-500">本月生成</p>
          </div>
        </Card>
        <Card className="shadow-sm border-gray-100">
          <div className="text-center">
            <Download className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-800">89%</p>
            <p className="text-sm text-gray-500">下载率</p>
          </div>
        </Card>
        <Card className="shadow-sm border-gray-100">
          <div className="text-center">
            <Calendar className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <p className="text-2xl font-bold text-gray-800">3</p>
            <p className="text-sm text-gray-500">定时任务</p>
          </div>
        </Card>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <Tabs defaultActiveKey="generate" items={tabItems} className="p-5" />
      </div>
    </div>
  );
};

export default ReportCenter;
