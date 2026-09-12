import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ cacheDir: 'node_modules/vite-cache', plugins: [react()], server: { fs: { deny: ['**/.*/**', '**/.env*', '**/server/**', '**/stuff/**'] } } });
