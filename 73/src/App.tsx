import React, { useEffect, Component, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import Dashboard from '@/pages/Dashboard';
import MultiAnalysis from '@/pages/MultiAnalysis';
import TrendAnalysis from '@/pages/TrendAnalysis';
import SpatialMap from '@/pages/SpatialMap';
import ReportCenter from '@/pages/ReportCenter';
import { useDataStore } from '@/store/useDataStore';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-6">
          <div className="max-w-md w-full bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-gray-200 dark:border-gray-800 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
              页面出错了
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {this.state.error?.message || '发生了未知错误，请稍后重试'}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              <RefreshCw className="w-4 h-4" />
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppInitializer: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { fetchStations, fetchDashboardStats } = useDataStore();

  useEffect(() => {
    const initializeApp = async () => {
      await Promise.all([fetchStations(), fetchDashboardStats()]);
    };
    initializeApp();
  }, [fetchStations, fetchDashboardStats]);

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router>
        <AppInitializer>
          <MainLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/analysis" element={<MultiAnalysis />} />
              <Route path="/trend" element={<TrendAnalysis />} />
              <Route path="/spatial" element={<SpatialMap />} />
              <Route path="/report" element={<ReportCenter />} />
            </Routes>
          </MainLayout>
        </AppInitializer>
      </Router>
    </ErrorBoundary>
  );
};

export default App;
