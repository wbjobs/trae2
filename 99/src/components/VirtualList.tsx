import { useRef, useState, useMemo, useCallback, useEffect } from 'react';

interface VirtualListProps<T> {
  items: T[];
  height: number;
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  overscan?: number;
}

export default function VirtualList<T>({
  items,
  height,
  itemHeight,
  renderItem,
  className = '',
  onScroll,
  overscan = 5,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = useMemo(() => {
    return items.length * itemHeight;
  }, [items.length, itemHeight]);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + height) / itemHeight) + overscan
    );

    return { startIndex, endIndex };
  }, [scrollTop, height, itemHeight, items.length, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex);
  }, [items, visibleRange.startIndex, visibleRange.endIndex]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    setScrollTop(target.scrollTop);
    onScroll?.(target.scrollTop);
  }, [onScroll]);

  const getItemOffset = useCallback(
    (index: number) => {
      return (visibleRange.startIndex + index) * itemHeight;
    },
    [visibleRange.startIndex, itemHeight]
  );

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, index) => (
          <div
            key={visibleRange.startIndex + index}
            style={{
              position: 'absolute',
              top: getItemOffset(index),
              left: 0,
              right: 0,
              height: itemHeight,
            }}
          >
            {renderItem(item, visibleRange.startIndex + index)}
          </div>
        ))}
      </div>
    </div>
  );
}
