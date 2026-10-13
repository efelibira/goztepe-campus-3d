import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { modelImportPlugin } from './server/modelImportPlugin.ts'

export default defineConfig({ plugins: [react(), modelImportPlugin()] })
