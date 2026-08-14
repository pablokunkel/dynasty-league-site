import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Route chunks are created by React.lazy in src/App.tsx. Everything from
    // node_modules goes to one vendor chunk so the framework caches across
    // deploys — a bare ['react', ...] list misses react-dom/client and leaves
    // the runtime in the app chunk, which then busts on every content change.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // marked is only reachable from the lazy Bylaws route; keep it out
            // of the shared vendor chunk so it stays on-demand.
            if (id.includes('marked')) return undefined
            return 'vendor'
          }
          return undefined
        },
      },
    },
  },
})
