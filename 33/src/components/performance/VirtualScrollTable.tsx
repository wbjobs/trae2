import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd/es/table';
import { SoundingDataPoint } from '@/types';

interface VirtualScrollTableProps<RecordType extends object = any> extends TableProps<RecordType> {
  height?: number;
  itemHeight?: number;
  bufferCount?: number;
}

function useVirtualScroll<RecordType extends object = any>(
  data: RecordType[],
  itemHeight: number = 40,
  bufferCount: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleData = useMemo(() => {
    const viewportHeight = 500;
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferCount);
    const endIndex = Math.min(
      data.length,
      Math.ceil((scrollTop + viewportHeight) / itemHeight + bufferCount
    );

    return {
      data: data.slice(Math.floor(startIndex), Math.floor(endIndex)),
      offsetY: startIndex * itemHeight,
      totalHeight: data.length * itemHeight,
      startIndex: Math.floor(startIndex),
      endIndex: Math.floor(endIndex)
    };
  }, [data, scrollTop, itemHeight, bufferCount]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  return {
    containerRef,
    visibleData,
    handleScroll,
    scrollTop
  };
}

export const SoundingDataTable: React.FC<{
  data: SoundingDataPoint[];
  loading?: boolean;
}> = ({ data, loading }) => {
  const visibleCount = Math.min(100, data.length);
  const displayData = useMemo(() => data.slice(0, visibleCount), [data, visibleCount]);

  const columns = useMemo(() => [
    {
      title: '气压(hPa)',
      dataIndex: 'pressure',
      key: 'pressure',
      width: 100,
      fixed: 'left' as const,
      render: (v: number) => <strong>{v}</strong>
    },
    {
      title: '高度(m)',
      dataIndex: 'height',
      key: 'height',
      width: 100
    },
    {
      title: '温度(°C)',
      dataIndex: 'temperature',
      key: 'temperature',
      width: 100,
      render: (v: number) => <span style={{ color: '#ff4d4f' }}>{v.toFixed(1)}</span>
    },
    {
      title: '露点(°C)',
      dataIndex: 'dewPoint',
      key: 'dewPoint',
      width: 100,
      render: (v: number) => <span style={{ color: '#1890ff' }}>{v.toFixed(1)}</span>
    },
    {
      title: '湿度(%)',
      dataIndex: 'relativeHumidity',
      key: 'relativeHumidity',
      width: 100
    },
    {
      title: '风速(m/s)',
      dataIndex: 'windSpeed',
      key: 'windSpeed',
      width: 100
    },
    {
      title: '风向(°)',
      dataIndex: 'windDirection',
      key: 'windDirection',
      width: 100
    },
    {
      title: 'U风(m/s)',
      dataIndex: 'uWind',
      key: 'uWind',
      width: 100
    },
    {
      title: 'V风(m/s)',
      dataIndex: 'vWind',
      key: 'vWind',
      width: 100,
      fixed: 'right' as const
    }
  ], []);

  if (data.length > 50) {
    console.log(`大数据量检测：${data.length}条，启用分页渲染前50条`);
  }

  return (
    <Table
      size="small"
      columns={columns}
      dataSource={displayData}
      rowKey="pressure"
      loading={loading}
      scroll={{ x: 900, y: 400 }}
      pagination={{
        pageSize: 20,
        showSizeChanger: true,
        showTotal: (total) => `共 ${data.length} 条，显示前 ${Math.min(50, data.length)} 条`
      }}
      virtual={true}
    />
  );
};

export const OptimizedTable: React.FC<{
  data: any[];
  columns: any[];
  loading?: boolean;
  rowKey?: string;
  pageSize?: number;
  height?: number;
}> = ({
  data,
  columns,
  loading,
  rowKey = 'id',
  pageSize = 50,
  height = 400
}) => {
  const shouldUsePagination = data.length > 200;

  return (
    <Table
      size="small"
      columns={columns}
      dataSource={data}
      rowKey={rowKey}
      loading={loading}
      scroll={{ x: 'max-content', y: height }}
      pagination={
        shouldUsePagination
          ? {
              pageSize,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`
            }
          : false
      }
      virtual={shouldUsePagination}
    />
  );
};
