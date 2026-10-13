import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdir, lstat, realpath, readFile, writeFile, rename, unlink, open } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { inspectGlb, MAX_GLB_BYTES } from '../src/data/glbImport.ts'
import { validateGlbModelCatalog } from '../src/data/modelCatalog.ts'
import type { GlbModelCatalog } from '../src/data/modelCatalog.ts'

export const IMPORT_ENDPOINT = '/__dev/models/import'
const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function isLocalImportRequest(req: IncomingMessage): boolean {
  if (!loopback.has(req.socket.remoteAddress ?? '') || !req.headers.host || typeof req.headers.origin !== 'string') return false
  try {
    const host = new URL(`http://${req.headers.host}`)
    return ['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)
      && host.host === req.headers.host && host.pathname === '/'
      && req.headers.origin === host.origin && !req.headers['x-forwarded-for'] && !req.headers.forwarded
      && req.headers['x-campus-import'] === '1'
      && (!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] === 'same-origin')
  } catch { return false }
}

async function safeDirectory(directory: string) {
  await mkdir(directory, { recursive: false }).catch((error) => { if (error.code !== 'EEXIST') throw error })
  if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw new Error('Model klasörü gerçek bir yerel klasör olmalı; sembolik bağlantı kullanılamaz.')
}

/** An exclusive catalog lock also protects against concurrent local Vite processes. */
export async function persistImportedModel(root: string, bytes: Uint8Array, filename: string, name: string) {
  const inspection = inspectGlb(bytes, filename)
  if (!name.trim() || name.length > 120 || /[\x00-\x1f]/.test(name)) throw new Error('Model adı 1–120 karakter olmalı.')
  const canonicalRoot = await realpath(root)
  const publicDir = path.join(canonicalRoot, 'public'), models = path.join(publicDir, 'models'), imported = path.join(models, 'imported')
  await safeDirectory(publicDir); await safeDirectory(models); await safeDirectory(imported)
  const catalogPath = path.join(models, 'catalog.json'), lockPath = path.join(models, '.catalog-import.lock')
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Katalog başka bir içe aktarma işlemi tarafından kullanılıyor; tekrar deneyin.') })
  let assetPath: string | undefined, temporaryPath: string | undefined
  let committed = false, assetCreated = false, temporaryCreated = false
  try {
    const stat = await lstat(catalogPath)
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('Katalog normal bir JSON dosyası olmalı (en fazla 5 MiB).')
    const catalog: GlbModelCatalog = JSON.parse(await readFile(catalogPath, 'utf8'))
    const validation = validateGlbModelCatalog(catalog)
    if (!validation.valid) throw new Error(`Mevcut katalog değiştirilmedi: ${validation.errors.join(' ')}`)
    let id: string
    do { id = `model-${randomUUID()}` } while (catalog.models.some((entry) => entry.id === id))
    const record = { id, name: name.trim(), file: `imported/${id}.glb` }
    assetPath = path.join(imported, `${id}.glb`)
    await writeFile(assetPath, bytes, { flag: 'wx' })
    assetCreated = true
    temporaryPath = path.join(models, `.catalog-${randomUUID()}.tmp`)
    await writeFile(temporaryPath, `${JSON.stringify({ ...catalog, models: [...catalog.models, record] }, null, 2)}\n`, { flag: 'wx' })
    temporaryCreated = true
    await rename(temporaryPath, catalogPath)
    committed = true
    return { model: record, ...inspection }
  } finally {
    if (!committed && assetCreated && assetPath) await unlink(assetPath).catch(() => {})
    if (temporaryCreated && temporaryPath) await unlink(temporaryPath).catch(() => {})
    await lock.close()
    await unlink(lockPath)
  }
}

export function createModelImportMiddleware(root: string) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== IMPORT_ENDPOINT) { next(); return }
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(body))
    }
    if (!isLocalImportRequest(req)) { reply(403, { error: 'İçe aktarma yalnızca aynı localhost sayfasından kullanılabilir.' }); return }
    if (req.method !== 'POST') { reply(405, { error: 'POST gerekli.' }); return }
    if (req.headers['content-type'] !== 'application/octet-stream') { reply(415, { error: 'İkili GLB dosyası gerekli.' }); return }
    if (Number(req.headers['content-length']) > MAX_GLB_BYTES) { reply(413, { error: 'Dosya en fazla 50 MiB olabilir.' }); return }
    try {
      const filename = decodeURIComponent(String(req.headers['x-model-filename'] ?? ''))
      const name = decodeURIComponent(String(req.headers['x-model-name'] ?? ''))
      let length = 0
      const chunks: Buffer[] = []
      req.setTimeout(30_000, () => req.destroy())
      for await (const chunk of req) {
        length += chunk.length
        if (length > MAX_GLB_BYTES) { reply(413, { error: 'Dosya en fazla 50 MiB olabilir.' }); return }
        chunks.push(chunk)
      }
      req.setTimeout(0)
      const result = await persistImportedModel(root, Buffer.concat(chunks), filename, name)
      reply(201, result)
    } catch (error) {
      reply(400, { error: error instanceof Error ? error.message : 'Model kaydedilemedi.' })
    }
  }
}

export function modelImportPlugin(): Plugin {
  return {
    name: 'localhost-glb-import',
    apply: 'serve',
    configResolved(config) {
      // Even --host cannot expose the development server's write API to the LAN.
      config.server.host = '127.0.0.1'
      config.server.cors = false
      config.server.allowedHosts = ['localhost', '127.0.0.1']
    },
    configureServer(server) {
      server.middlewares.use(createModelImportMiddleware(server.config.root))
    },
    // Deliberately no configurePreviewServer: production/preview has no upload API.
  }
}
