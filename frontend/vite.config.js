import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: './frontend',  // If your Vite config and index.html are in the 'frontend' folder
  build: {
    outDir: 'dist',  // Change if your output directory is different
  }
})
