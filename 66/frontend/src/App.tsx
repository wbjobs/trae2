import { Routes, Route } from 'react-router-dom';
import { Layout } from 'antd';
import MainLayout from './components/MainLayout';
import Dashboard from './pages/Dashboard';
import ResourceList from './pages/ResourceList';
import ResourceDetail from './pages/ResourceDetail';
import ResourceForm from './pages/ResourceForm';
import GrowthRecords from './pages/GrowthRecords';
import GrowthAnalysis from './pages/GrowthAnalysis';
import CategoryManage from './pages/CategoryManage';
import ImageGallery from './pages/ImageGallery';
import DistributionMap from './pages/DistributionMap';

const { Content } = Layout;

function App() {
  return (
    <MainLayout>
      <Content style={{ padding: '24px', minHeight: 'calc(100vh - 64px)' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/resources" element={<ResourceList />} />
          <Route path="/resources/new" element={<ResourceForm />} />
          <Route path="/resources/:id" element={<ResourceDetail />} />
          <Route path="/resources/:id/edit" element={<ResourceForm />} />
          <Route path="/growth" element={<GrowthRecords />} />
          <Route path="/growth/analysis" element={<GrowthAnalysis />} />
          <Route path="/distribution" element={<DistributionMap />} />
          <Route path="/categories" element={<CategoryManage />} />
          <Route path="/images" element={<ImageGallery />} />
        </Routes>
      </Content>
    </MainLayout>
  );
}

export default App;
