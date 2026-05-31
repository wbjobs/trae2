import React, { useMemo } from 'react'
import { Table, TableProps } from 'antd'
import { useVirtualScroll, useBatchUpdate } from '../hooks/usePerformance'

interface OptimizedTableProps<T extends Record<string, any>> extends Omit<TableProps<T>, 'dataSource'> {
  dataSource: T[]
  itemHeight?: number
  containerHeight?: number
  useVirtualScroll?: boolean
  useBatchLoading?: boolean
  batchSize?: number
  batchInterval?: number
}

function OptimizedTable<T extends Record<string, any> & { key?: string | number }>({
  dataSource,
  itemHeight = 54,
  containerHeight = 500,
  useVirtualScroll: enableVirtualScroll = false,
  useBatchLoading: enableBatchLoading = false,
  batchSize = 50,
  batchInterval = 100,
  scroll,
  ...tableProps
}: OptimizedTableProps<T>) {
  const displayData = useBatchUpdate(
    dataSource,
    enableBatchLoading ? batchSize : dataSource.length,
    batchInterval
  )

  const { containerRef, handleScroll, visibleItems, totalHeight, offsetY } = useVirtualScroll(
    displayData,
    itemHeight,
    containerHeight
  )

  const renderContent = () => {
    if (enableVirtualScroll && displayData.length > batchSize) {
      return (
        <div
          ref={containerRef as any}
          style={{ height: containerHeight, overflow: 'auto' }}
          onScroll={handleScroll}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetY}px)` }}>
              <Table
                {...tableProps}
                dataSource={visibleItems}
                pagination={false}
                showHeader={true}
                scroll={{ y: containerHeight }}
              />
            </div>
          </div>
        </div>
      )
    }

    return (
      <Table
        {...tableProps}
        dataSource={displayData}
        scroll={{ y: containerHeight, ...scroll }}
      />
    )
  }

  return (
    <div>
      {enableBatchLoading && displayData.length < dataSource.length && (
        <div style={{ textAlign: 'right', padding: '8px 0', color: '#999' }}>
          加载中... {displayData.length}/{dataSource.length} 条
        </div>
      )}
      {renderContent()}
    </div>
  )
}

export default OptimizedTable
