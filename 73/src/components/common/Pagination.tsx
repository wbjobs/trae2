import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const pageSizeOptions = [10, 20, 50, 100];

const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) => {
  const [jumpPage, setJumpPage] = useState('');

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (page <= 4) {
        pages.push(1, 2, 3, 4, 5, '...', totalPages);
      } else if (page >= totalPages - 3) {
        pages.push(
          1,
          '...',
          totalPages - 4,
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages
        );
      } else {
        pages.push(1, '...', page - 1, page, page + 1, '...', totalPages);
      }
    }
    return pages;
  };

  const handleJump = () => {
    const num = parseInt(jumpPage);
    if (num >= 1 && num <= totalPages && num !== page) {
      onPageChange(num);
    }
    setJumpPage('');
  };

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          共 <span className="font-semibold text-gray-900 dark:text-white">{total}</span> 条，
          显示 {startItem}-{endItem}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">每页</span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="h-8 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500 dark:text-gray-400">条</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {getPageNumbers().map((p, idx) =>
          p === '...' ? (
            <span key={idx} className="px-2 text-gray-400">
              ...
            </span>
          ) : (
            <button
              key={idx}
              onClick={() => onPageChange(p as number)}
              className={`min-w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-[#1e3a5f] text-white'
                  : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || totalPages === 0}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages || totalPages === 0}
          className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 ml-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">跳至</span>
          <input
            type="number"
            value={jumpPage}
            onChange={(e) => setJumpPage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJump()}
            min={1}
            max={totalPages}
            className="w-14 h-8 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 text-sm text-center text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#2dd4bf]"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">页</span>
        </div>
      </div>
    </div>
  );
};

export { Pagination };
