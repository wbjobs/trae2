import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/signaling': 'http://localhost:3001',
      '/api/links': 'http://localhost:3001',
      '/api/stations': 'http://localhost:3001',
      '/api/analysis': 'http://localhost:3002',
      '/api/sync': 'http://localhost:3003',
      '/api/nodes': 'http://localhost:3003',
      '/api/audit': 'http://localhost:3004',
    },
  },
});
