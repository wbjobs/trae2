import { useState, useRef, useCallback, useEffect } from 'react';

interface UseInfiniteScrollOptions<T> {
  loadMore: (page: number) => Promise<{ data: T[]; hasMore: boolean; total?: number }>;
  threshold?: number;
  initialPage?: number;
  pageSize?: number;
}

interface UseInfiniteScrollResult<T> {
  data: T[];
  loading: boolean;
  hasMore: boolean;
  total: number;
  page: number;
  loadMore: () => Promise<void>;
  reset: () => void;
  observerRef: (element: HTMLDivElement | null) => void;
}

export function useInfiniteScroll<T>({
  loadMore,
  threshold = 200,
  initialPage = 1,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useRef<HTMLDivElement | null>(null);

  const loadMoreData = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    try {
      const result = await loadMore(page);
      setData((prev) => [...prev, ...result.data]);
      setHasMore(result.hasMore);
      setTotal(result.total || 0);
      setPage((prev) => prev + 1);
    } catch (error) {
      console.error('Error loading more data:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, loadMore]);

  const observerCallback = useCallback<IntersectionObserverCallback>(
    (entries) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !loading) {
        loadMoreData();
      }
    },
    [hasMore, loading, loadMoreData]
  );

  const observerRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (observer.current) {
        observer.current.disconnect();
      }

      if (element) {
        observer.current = new IntersectionObserver(observerCallback, {
          rootMargin: `${threshold}px`,
          threshold: 0.1,
        });
        observer.current.observe(element);
      }

      lastElementRef.current = element;
    },
    [observerCallback, threshold]
  );

  const reset = useCallback(() => {
    setData([]);
    setPage(initialPage);
    setHasMore(true);
    setTotal(0);
  }, [initialPage]);

  useEffect(() => {
    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, []);

  return {
    data,
    loading,
    hasMore,
    total,
    page,
    loadMore: loadMoreData,
    reset,
    observerRef,
  };
}
