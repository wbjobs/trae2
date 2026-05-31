import { defineConfig } from 'vite'
import { createVuePlugin } from 'vite-plugin-vue2'
import path from 'path'

export default defineConfig({
  build: {
    sourcemap: 'hidden',
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    createVuePlugin({
      jsx: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'vue$': 'vue/dist/vue.esm.js',
    },
  },
  server: {
    host: '0.0.0.0',
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
    },
  },
})
