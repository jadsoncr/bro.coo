import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/operator': 'http://localhost:3000',
      '/owner': 'http://localhost:3000',
      '/master': 'http://localhost:3000',
      '/webhook': 'http://localhost:3000',
      '/simulate': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
  preview: {
    allowedHosts: ['brocco-production.up.railway.app'],
  },
});
