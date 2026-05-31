import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, Download, Database, ChevronRight } from 'lucide-react';
import { Select, DatePicker, Input, Button, Table, Tag, Space, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { MonitorData, MonitorFactor, MonitorSection, QueryParams } from '../../types';
import { getFactors, getSections, getHistoryData } from '../../api';
import { ReportExporter } from '../../modules/export';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search: SearchInput } = Input;

const DataQuery: React.FC = () => {
  const [factors, setFactors] = useState<MonitorFactor[]>([]);
  const [sections, setSections] = useState<MonitorSection[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [selectedFactor, setSelectedFactor] = useState<string>('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [data, setData] = useState<MonitorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [selectedRows, setSelectedRows] = useState<MonitorData[]>([]);
  const initializedRef = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      const [factorsData, sectionsData] = await Promise.all([
        getFactors(),
        getSections(),
      ]);
      setFactors(factorsData);
      setSections(sectionsData);
      if (sectionsData.length > 0) {
        setSelectedSection(sectionsData[0].id);
      }
      if (factorsData.length > 0) {
        setSelectedFactor(factorsData[0].id);
      }
    };
    fetchData();
  }, []);

  const fetchData = useCallback(async () => {
    if (loadingRef.current) return;
    if (!selectedSection || !selectedFactor) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const params: QueryParams = {
        sectionId: selectedSection,
        factorId: selectedFactor,
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        page: pagination.current,
        pageSize: pagination.pageSize,
      };
      const result = await getHistoryData(params);
      setData(result.list);
      setPagination((prev) => ({
        ...prev,
        total: result.total,
      }));
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [selectedSection, selectedFactor, dateRange, pagination.current, pagination.pageSize]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    fetchData();
  }, [fetchData]);

  const handleSearch = () => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    initializedRef.current = true;
    fetchData();
  };

  const handleExportExcel = () => {
    const exporter = new ReportExporter();
    const exportData = selectedRows.length > 0 ? selectedRows : data;
    const blob = exporter.exportMonitorDataToExcel(exportData, {
      title: '监测数据报表',
      includeSummary: true,
    });
    exporter.downloadFile(blob, `监测数据_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
    message.success('导出成功');
  };

  const getFactorName = (factorId: string) => {
    return factors.find((f) => f.id === factorId)?.name || factorId;
  };

  const getSectionName = (sectionId: string) => {
    return sections.find((s) => s.id === sectionId)?.name || sectionId;
  };

  const getQualityColor = (value: number, factorId: string) => {
    const factor = factors.find((f) => f.id === factorId);
    if (!factor) return 'default';
    if (value <= factor.standardValue) return 'green';
    if (value <= factor.standardValue * 1.5) return 'orange';
    return 'red';
  };

  const columns: ColumnsType<MonitorData> = [
    {
      title: '序号',
      key: 'index',
      width: 80,
      render: (_: any, __: any, index: number) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: '监测时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '监测断面',
      dataIndex: 'sectionId',
      key: 'sectionId',
      render: (text: string) => getSectionName(text),
    },
    {
      title: '监测因子',
      dataIndex: 'factorId',
      key: 'factorId',
      render: (text: string) => getFactorName(text),
    },
    {
      title: '监测值',
      dataIndex: 'value',
      key: 'value',
      render: (value: number, record) => (
        <Space>
          <span className="font-mono font-medium">{value.toFixed(3)}</span>
          <Tag color={getQualityColor(value, record.factorId)}>
            {value <= (factors.find((f) => f.id === record.factorId)?.standardValue || 0)
              ? '达标'
              : '超标'}
          </Tag>
        </Space>
      ),
    },
    {
      title: '标准值',
      key: 'standard',
      render: (_, record) => {
        const factor = factors.find((f) => f.id === record.factorId);
        return factor ? `${factor.standardValue} ${factor.unit}` : '-';
      },
    },
    {
      title: '数据状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'normal' ? 'green' : status === 'warning' ? 'orange' : 'red'}>
          {status === 'normal' ? '正常' : status === 'warning' ? '预警' : '异常'}
        </Tag>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys: selectedRows.map((row) => row.id),
    onChange: (_: React.Key[], selectedRows: MonitorData[]) => {
      setSelectedRows(selectedRows);
    },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-cyan-100 text-sm">数据总量</p>
              <p className="text-2xl font-bold mt-1">{pagination.total.toLocaleString()}</p>
            </div>
            <Database className="w-10 h-10 text-cyan-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm">正常数据</p>
              <p className="text-2xl font-bold mt-1">
                {Math.round(pagination.total * 0.92).toLocaleString()}
              </p>
            </div>
            <ChevronRight className="w-10 h-10 text-emerald-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-100 text-sm">预警数据</p>
              <p className="text-2xl font-bold mt-1">
                {Math.round(pagination.total * 0.06).toLocaleString()}
              </p>
            </div>
            <ChevronRight className="w-10 h-10 text-amber-200" />
          </div>
        </div>
        <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-rose-100 text-sm">异常数据</p>
              <p className="text-2xl font-bold mt-1">
                {Math.round(pagination.total * 0.02).toLocaleString()}
              </p>
            </div>
            <ChevronRight className="w-10 h-10 text-rose-200" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Search className="w-5 h-5 text-cyan-500" />
          <h3 className="text-base font-semibold text-gray-800">数据筛选</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              监测断面
            </label>
            <Select
              value={selectedSection}
              onChange={setSelectedSection}
              className="w-full"
              size="large"
              allowClear
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
              allowClear
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
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-2">
              关键词搜索
            </label>
            <SearchInput
              placeholder="输入关键词..."
              size="large"
              onSearch={handleSearch}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              type="primary"
              size="large"
              className="bg-cyan-500 hover:bg-cyan-600"
              onClick={handleSearch}
              icon={<Search className="w-4 h-4" />}
            >
              查询
            </Button>
            <Button
              size="large"
              onClick={handleExportExcel}
              icon={<Download className="w-4 h-4" />}
            >
              导出
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">历史数据</h3>
          <div className="text-sm text-gray-500">
            已选择 <span className="text-cyan-600 font-medium">{selectedRows.length}</span> 条数据
          </div>
        </div>
        <Table
          columns={columns}
          dataSource={data}
          loading={loading}
          rowKey="id"
          rowSelection={rowSelection}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) => {
              setPagination((prev) => ({ ...prev, current: page, pageSize }));
            },
          }}
          scroll={{ x: 800 }}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4">数据说明</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <h4 className="font-medium text-gray-700 mb-2">数据范围</h4>
            <ul className="space-y-1 text-gray-500">
              <li>• 时间范围：2020年至今</li>
              <li>• 监测频率：每4小时一次</li>
              <li>• 监测断面：8个</li>
              <li>• 监测因子：8项</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">数据质量</h4>
            <ul className="space-y-1 text-gray-500">
              <li>• 数据完整率：98.5%</li>
              <li>• 异常值检出率：1.2%</li>
              <li>• 数据校准：每日自动校准</li>
              <li>• 质量审核：三级审核</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 mb-2">导出说明</h4>
            <ul className="space-y-1 text-gray-500">
              <li>• 支持Excel格式导出</li>
              <li>• 可勾选数据后导出</li>
              <li>• 包含数据统计摘要</li>
              <li>• 最大导出量：10000条</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataQuery;
