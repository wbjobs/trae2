import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useCollaborationStore } from './stores/collaborationStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SpecimenListPage from './pages/SpecimenListPage';
import SpecimenDetailPage from './pages/SpecimenDetailPage';
import SpecimenEditPage from './pages/SpecimenEditPage';
import UserManagementPage from './pages/UserManagementPage';
import FileManagementPage from './pages/FileManagementPage';
import OperationLogPage from './pages/OperationLogPage';

const ProtectedRoute = ({ children, roles }: { children: React.ReactNode; roles?: string[] }) => {
  const { isAuthenticated, user } = useAuthStore();
  
  useEffect(() => {
    const { connect } = useCollaborationStore.getState();
    if (isAuthenticated) {
      connect();
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }

  return <Layout>{children}</Layout>;
};

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      } />
      
      <Route path="/specimens" element={
        <ProtectedRoute>
          <SpecimenListPage />
        </ProtectedRoute>
      } />
      
      <Route path="/specimens/new" element={
        <ProtectedRoute roles={['admin', 'specimen_admin', 'department_head']}>
          <SpecimenEditPage />
        </ProtectedRoute>
      } />
      
      <Route path="/specimens/:id" element={
        <ProtectedRoute>
          <SpecimenDetailPage />
        </ProtectedRoute>
      } />
      
      <Route path="/specimens/:id/edit" element={
        <ProtectedRoute roles={['admin', 'specimen_admin', 'department_head']}>
          <SpecimenEditPage />
        </ProtectedRoute>
      } />
      
      <Route path="/files" element={
        <ProtectedRoute>
          <FileManagementPage />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/users" element={
        <ProtectedRoute roles={['admin']}>
          <UserManagementPage />
        </ProtectedRoute>
      } />
      
      <Route path="/admin/logs" element={
        <ProtectedRoute roles={['admin']}>
          <OperationLogPage />
        </ProtectedRoute>
      } />
      
      <Route path="/403" element={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-slate-300">403</h1>
            <p className="text-xl text-slate-600 mt-2">访问被拒绝</p>
            <p className="text-slate-500 mt-1">您没有权限访问此页面</p>
          </div>
        </div>
      } />
      
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <h1 className="text-6xl font-bold text-slate-300">404</h1>
            <p className="text-xl text-slate-600 mt-2">页面不存在</p>
          </div>
        </div>
      } />
    </Routes>
  );
};

export default App;
