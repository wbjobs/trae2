import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation.js';
import Dashboard from './pages/Dashboard.js';
import TimeSeries from './pages/TimeSeries.js';
import Anomaly from './pages/Anomaly.js';
import Risk from './pages/Risk.js';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'timeseries':
        return <TimeSeries />;
      case 'anomaly':
        return <Anomaly />;
      case 'risk':
        return <Risk />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Navigation currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="flex-1 overflow-hidden">
        {renderPage()}
      </main>
    </div>
  );
};

export default App;
