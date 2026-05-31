import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import SectionMap from './pages/SectionMap';
import TrendAnalysis from './pages/TrendAnalysis';
import IndicatorCalc from './pages/IndicatorCalc';
import DataQuery from './pages/DataQuery';
import ReportCenter from './pages/ReportCenter';
import Comparison from './pages/Comparison';

export default function App() {
  return (
    <Router>
      <MainLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/section-map" element={<SectionMap />} />
          <Route path="/trend" element={<TrendAnalysis />} />
          <Route path="/comparison" element={<Comparison />} />
          <Route path="/indicator" element={<IndicatorCalc />} />
          <Route path="/data-query" element={<DataQuery />} />
          <Route path="/report" element={<ReportCenter />} />
        </Routes>
      </MainLayout>
    </Router>
  );
}
