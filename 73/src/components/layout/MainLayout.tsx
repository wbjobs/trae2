import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setMobileOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsed((prev) => !prev);
    }
  };

  const handleMobileClose = () => {
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header onToggleSidebar={handleToggleSidebar} />
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
      />
      <main
        className={cn(
          'pt-16 transition-all duration-300',
          'lg:pl-64',
          collapsed && 'lg:pl-16'
        )}
      >
        <div className="min-h-[calc(100vh-64px)]">{children}</div>
      </main>
    </div>
  );
};

export default MainLayout;
