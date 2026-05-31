import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#006633',
          borderRadius: 6,
          fontSize: 14
        },
        components: {
          Layout: {
            headerBg: '#006633',
            headerHeight: 64,
            siderBg: '#f0f5f0',
            bodyBg: '#f5f7f5'
          },
          Menu: {
            darkItemBg: '#006633',
            darkSubMenuItemBg: '#005528',
            darkItemSelectedBg: '#008844',
            itemSelectedBg: '#e6f4ea'
          }
        }
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
