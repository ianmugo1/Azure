import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base is './' so `npm run build` output works when opened from a subfolder
// or served from any path (e.g. behind a reverse proxy / Tailscale).
export default defineConfig({
  base: './',
  plugins: [react()],
})
