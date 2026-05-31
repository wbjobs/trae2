import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  fullscreen?: boolean;
  text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ fullscreen, text }) => {
  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: '#1e3a5f' }}
        />
        <div
          className="absolute inset-0 animate-ping opacity-30"
          style={{ color: '#2dd4bf' }}
        >
          <Loader2 className="w-8 h-8" />
        </div>
      </div>
      {text && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return <div className="flex items-center justify-center py-8">{content}</div>;
};

export { LoadingSpinner };
