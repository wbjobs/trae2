import { useEffect } from 'react';
import { X, Info, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useGameStore } from '../../store/gameStore';

const icons = {
  info: <Info className="w-4 h-4 text-blue-400" />,
  warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
  success: <CheckCircle className="w-4 h-4 text-green-400" />,
  error: <XCircle className="w-4 h-4 text-red-400" />,
};

const bgColors = {
  info: 'bg-blue-900/80 border-blue-500',
  warning: 'bg-yellow-900/80 border-yellow-500',
  success: 'bg-green-900/80 border-green-500',
  error: 'bg-red-900/80 border-red-500',
};

export function NotificationToast() {
  const { notifications, removeNotification } = useGameStore();

  useEffect(() => {
    notifications.forEach(notification => {
      const timer = setTimeout(() => {
        removeNotification(notification.id);
      }, 5000);
      return () => clearTimeout(timer);
    });
  }, [notifications, removeNotification]);

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm ${bgColors[notification.type]} animate-slide-in`}
        >
          {icons[notification.type]}
          <span className="text-white text-sm">{notification.message}</span>
          <button
            onClick={() => removeNotification(notification.id)}
            className="ml-2 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
