import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import DataQuery from './pages/DataQuery';
import DataAnalysis from './pages/DataAnalysis';
import DataVisualization from './pages/DataVisualization';
import MultiStationComparison from './pages/MultiStationComparison';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <MainLayout>
      <Content style={{ background: '#f0f2f5', minHeight: 'calc(100vh - 64px)' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/query" element={<DataQuery />} />
          <Route path="/analysis" element={<DataAnalysis />} />
          <Route path="/visualization" element={<DataVisualization />} />
          <Route path="/comparison" element={<MultiStationComparison />} />
        </Routes>
      </Content>
    </MainLayout>
  );
};

export default App;
