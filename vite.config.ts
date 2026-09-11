import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Dev stand-in for worker/index.js: every /api/* route the Worker
    // allowlists is the matching Sleeper /v1/* path, so a prefix rewrite lets
    // the LIVE overlays (draft picks, game-day scores) run against real data
    // without `wrangler dev`. Production never sees this — the Worker answers.
    proxy: {
      '/api': {
        target: 'https://api.sleeper.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\//, '/v1/'),
      },
    },
  },
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
