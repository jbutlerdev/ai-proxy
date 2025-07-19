import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-pwa-assets',
      writeBundle() {
        // Copy service worker to public directory after build
        const swPath = path.resolve(__dirname, 'src/admin/sw.js');
        const swOutPath = path.resolve(__dirname, 'public/sw.js');
        try {
          copyFileSync(swPath, swOutPath);
          console.log('Service worker copied to public directory');
        } catch (error) {
          console.error('Failed to copy service worker:', error);
        }
        
        // Copy 512x512 icon
        const icon512Path = path.resolve(__dirname, 'src/admin/icon-512x512.png');
        const icon512OutPath = path.resolve(__dirname, 'public/icon-512x512.png');
        try {
          copyFileSync(icon512Path, icon512OutPath);
          console.log('512x512 icon copied to public directory');
        } catch (error) {
          console.error('Failed to copy 512x512 icon:', error);
        }
      }
    }
  ],
  root: './src/admin',
  build: {
    outDir: '../../public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          // Keep PWA assets with their original names
          if (assetInfo.name === 'manifest.json' || 
              assetInfo.name?.endsWith('.png') || 
              assetInfo.name === 'sw.js') {
            return '[name][extname]';
          }
          // Hash other assets normally
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/admin'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  publicDir: './src/admin',
});