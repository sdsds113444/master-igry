import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Тяжёлые вендоры — в отдельные чанки, чтобы они кэшировались между релизами
        // приложения (меняется код приложения → эти чанки остаются в кэше браузера).
        manualChunks(id) {
          if (id.includes('@supabase/supabase-js')) return 'supabase'
          if (id.includes('framer-motion')) return 'motion'
        },
      },
    },
  },
})
