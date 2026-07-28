import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load env file from the parent directory or current directory
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = process.env.VITE_BACKEND_URL || env.VITE_BACKEND_URL || 'http://127.0.0.1:4000'
  return {
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/socket.io': {
          target: backendUrl,
          ws: true,
          changeOrigin: true
        },
        '/api': {
          target: backendUrl,
          changeOrigin: true
        }
      }
    }
  }
})
