import { defaultClientConditions, defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // use the stream-charts library's source (its "source" export condition), so that changes to
    // the library show up in the app right away, without building the library
    conditions: ['source', ...defaultClientConditions],
  },
})
