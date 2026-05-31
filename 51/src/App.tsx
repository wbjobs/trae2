import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ElementsPage from './pages/ElementsPage';
import SimulationPage from './pages/SimulationPage';
import ResultsPage from './pages/ResultsPage';
import BatchComparisonPage from './pages/BatchComparisonPage';
import PlaybackPage from './pages/PlaybackPage';
import ReportPage from './pages/ReportPage';
import type { OpticalElement, LightSource, SimulationResult } from './types';

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [elements, setElements] = useState<OpticalElement[]>([]);
  const [lightSource, setLightSource] = useState<LightSource>({
    wavelength: 632.8,
    power: 1.0,
    beam_diameter: 5.0,
    position: { x: 0, y: 0, z: 0 },
  });
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState(false);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/health');
        setIsBackendConnected(response.ok);
      } catch {
        setIsBackendConnected(false);
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            elements={elements}
            onNavigate={setCurrentPage}
            isBackendConnected={isBackendConnected}
          />
        );
      case 'elements':
        return (
          <ElementsPage
            elements={elements}
            setElements={setElements}
            lightSource={lightSource}
            setLightSource={setLightSource}
          />
        );
      case 'simulation':
        return (
          <SimulationPage
            elements={elements}
            lightSource={lightSource}
            onSimulationComplete={setSimulationResult}
          />
        );
      case 'results':
        return <ResultsPage result={simulationResult} />;
      case 'batch':
        return (
          <BatchComparisonPage
            elements={elements}
            lightSource={lightSource}
          />
        );
      case 'playback':
        return <PlaybackPage simulationResult={simulationResult} />;
      case 'report':
        return (
          <ReportPage
            simulationResult={simulationResult}
            elements={elements}
          />
        );
      default:
        return <Dashboard elements={elements} onNavigate={setCurrentPage} isBackendConnected={isBackendConnected} />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="flex justify-between items-center">
          <div>
            <h1>精密仪器光路调试离线仿真系统</h1>
            <p className="subtitle">Optical Path Alignment Simulation System v2.0</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-badge ${isBackendConnected ? 'success' : 'error'}`}>
              {isBackendConnected ? '● 服务已连接' : '● 服务未连接'}
            </span>
          </div>
        </div>
      </header>

      <div className="app-main">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="main-content">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
