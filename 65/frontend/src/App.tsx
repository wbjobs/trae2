import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import SpecimenList from './pages/specimen/SpecimenList';
import SpecimenDetail from './pages/specimen/SpecimenDetail';
import SpecimenForm from './pages/specimen/SpecimenForm';
import ImageViewer from './pages/image/ImageViewer';
import ImageViewerV2 from './pages/image/ImageViewerV2';
import TraceabilityMap from './pages/traceability/TraceabilityMap';
import UserManagement from './pages/user/UserManagement';
import ProfilePage from './pages/ProfilePage';
import SmartSearch from './pages/search/SmartSearch';
import SharingCenter from './pages/sharing/SharingCenter';
import ProtectedRoute from './components/auth/ProtectedRoute';

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      checkAuth();
    }
  }, [checkAuth, isAuthenticated]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="specimens" element={<SpecimenList />} />
        <Route path="specimens/:id" element={<SpecimenDetail />} />
        <Route path="specimens/new" element={<SpecimenForm />} />
        <Route path="specimens/:id/edit" element={<SpecimenForm />} />
        <Route path="images/:specimenId" element={<ImageViewerV2 />} />
        <Route path="traceability/:specimenId" element={<TraceabilityMap />} />
        <Route path="users" element={<UserManagement />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="search" element={<SmartSearch />} />
        <Route path="sharing" element={<SharingCenter />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
