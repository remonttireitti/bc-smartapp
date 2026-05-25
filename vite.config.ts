import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { inviteCompanyUserPlugin } from './vite.invite-plugin';

export default defineConfig({
  plugins: [react(), inviteCompanyUserPlugin()],
  server: { port: 5173 },
});
