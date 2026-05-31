import React from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

const PageContainer: React.FC<PageContainerProps> = ({ title, subtitle, children, className }) => {
  return (
    <div className={cn('p-4 lg:p-6', className)}>
      {(title || subtitle) && (
        <div className="mb-6">
          {title && (
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 lg:p-6">
        {children}
      </div>
    </div>
  );
};

export default PageContainer;
