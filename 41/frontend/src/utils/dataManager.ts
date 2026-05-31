import { useRef, useCallback, useEffect, useState } from 'react';

interface DataBuffer {
  [key: string]: any[];
}

interface UpdateCallback {
  (data: any): void;
}

class DataManager {
  private dataBuffer: DataBuffer = {};
  private subscribers: Map<string, Set<UpdateCallback>> = new Map();
  private throttledUpdates: Map<string, NodeJS.Timeout> = new Map();
  private MAX_BUFFER_SIZE = 100;
  private THROTTLE_MS = 500;

  addData(key: string, data: any): void {
    if (!this.dataBuffer[key]) {
      this.dataBuffer[key] = [];
    }
    
    this.dataBuffer[key].push(data);
    
    if (this.dataBuffer[key].length > this.MAX_BUFFER_SIZE) {
      this.dataBuffer[key] = this.dataBuffer[key].slice(-this.MAX_BUFFER_SIZE);
    }
    
    this.notifySubscribers(key, data);
  }

  getData(key: string, limit?: number): any[] {
    const data = this.dataBuffer[key] || [];
    return limit ? data.slice(-limit) : data;
  }

  getLatestData(key: string): any | null {
    const data = this.dataBuffer[key] || [];
    return data.length > 0 ? data[data.length - 1] : null;
  }

  subscribe(key: string, callback: UpdateCallback): () => void {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    
    this.subscribers.get(key)!.add(callback);
    
    return () => {
      this.subscribers.get(key)?.delete(callback);
    };
  }

  private notifySubscribers(key: string, data: any): void {
    if (this.throttledUpdates.has(key)) {
      return;
    }
    
    this.throttledUpdates.set(key, setTimeout(() => {
      this.throttledUpdates.delete(key);
    }, this.THROTTLE_MS));
    
    const callbacks = this.subscribers.get(key);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in subscriber for ${key}:`, e);
        }
      });
    }
  }

  clear(key?: string): void {
    if (key) {
      delete this.dataBuffer[key];
      this.subscribers.delete(key);
    } else {
      this.dataBuffer = {};
      this.subscribers.clear();
    }
  }

  getStats(): { keys: string[]; totalDataPoints: number } {
    const keys = Object.keys(this.dataBuffer);
    const totalDataPoints = keys.reduce((sum, key) => sum + this.dataBuffer[key].length, 0);
    return { keys, totalDataPoints };
  }
}

export const dataManager = new DataManager();

export function useDataBuffer(key: string, limit?: number) {
  const [data, setData] = useState<any[]>(() => dataManager.getData(key, limit));
  
  const updateData = useCallback((newData: any) => {
    setData(prev => {
      const updated = [...prev, newData];
      return limit ? updated.slice(-limit) : updated;
    });
  }, [limit]);
  
  useEffect(() => {
    const unsubscribe = dataManager.subscribe(key, updateData);
    return unsubscribe;
  }, [key, updateData]);
  
  return data;
}

export function useLatestData(key: string) {
  const [data, setData] = useState<any>(() => dataManager.getLatestData(key));
  
  useEffect(() => {
    const unsubscribe = dataManager.subscribe(key, setData);
    return unsubscribe;
  }, [key]);
  
  return data;
}

export function useBatchData(keys: string[], limit?: number) {
  const [batchData, setBatchData] = useState<Map<string, any[]>>(new Map());
  const keysRef = useRef(keys.join(','));
  
  useEffect(() => {
    keysRef.current = keys.join(',');
    const initialData = new Map<string, any[]>();
    keys.forEach(key => {
      initialData.set(key, dataManager.getData(key, limit));
    });
    setBatchData(initialData);
  }, [keys.join(','), limit]);
  
  useEffect(() => {
    const unsubscribers = keys.map(key => {
      return dataManager.subscribe(key, (data) => {
        setBatchData(prev => {
          const updated = new Map(prev);
          const currentData = updated.get(key) || [];
          const newData = [...currentData, data];
          updated.set(key, limit ? newData.slice(-limit) : newData);
          return updated;
        });
      });
    });
    
    return () => unsubscribers.forEach(unsub => unsub());
  }, [keysRef.current, limit]);
  
  return batchData;
}

export function useWebSocketData(url: string, keys: string[]) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.string_id && keys.includes(data.string_id)) {
            dataManager.addData(data.string_id, data);
          } else if (keys.includes('*')) {
            dataManager.addData(data.string_id || 'all', data);
          }
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setIsConnected(false);
        setTimeout(connect, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close();
      };
    };
    
    connect();
    
    return () => {
      wsRef.current?.close();
    };
  }, [url, keys.join(',')]);
  
  return { isConnected, ws: wsRef.current };
}

export function useVirtualScroll(
  containerRef: React.RefObject<HTMLElement>,
  itemHeight: number,
  totalItems: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      setScrollTop(container.scrollTop);
      setViewportHeight(container.clientHeight);
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    setViewportHeight(container.clientHeight);
    
    return () => container.removeEventListener('scroll', handleScroll);
  }, [containerRef]);
  
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    totalItems,
    Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
  );
  
  return {
    startIndex,
    endIndex,
    visibleItems: endIndex - startIndex,
    offsetY: startIndex * itemHeight,
  };
}

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

export function useThrottle<T>(value: T, interval: number = 500): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdated = useRef<number>(Date.now());
  
  useEffect(() => {
    const now = Date.now();
    if (now >= lastUpdated.current + interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    }
  }, [value, interval]);
  
  return throttledValue;
}
