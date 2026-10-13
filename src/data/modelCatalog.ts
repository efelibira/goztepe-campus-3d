export type GlbCatalogRecord = { id: string; name: string; file: string }
export type GlbCatalogAsset = GlbCatalogRecord & { url: string }
export type GlbModelCatalog = { version: 1; models: GlbCatalogRecord[] }

const ASSET_ID = /^[a-z\d][a-z\d._-]*$/i
const FILE_SEGMENT = /^[a-z\d][a-z\d._-]*$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateGlbModelCatalog(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!isRecord(value)) return { valid: false, errors: ['Model kataloğu bir nesne olmalı.'] }
  if (Object.keys(value).some((key) => !['version', 'models'].includes(key))) errors.push('Model kataloğu şema dışı alan içeriyor.')
  if (value.version !== 1) errors.push('Model kataloğu sürümü 1 olmalı.')
  if (!Array.isArray(value.models)) return { valid: false, errors: [...errors, 'models bir dizi olmalı.'] }
  const ids = new Set<string>()
  for (const [index, entry] of value.models.entries()) {
    const label = `models[${index}]`
    if (!isRecord(entry)) { errors.push(`${label} bir nesne olmalı.`); continue }
    if (Object.keys(entry).some((key) => !['id', 'name', 'file'].includes(key))) errors.push(`${label} şema dışı alan içeriyor.`)
    if (typeof entry.id !== 'string' || !ASSET_ID.test(entry.id) || entry.id.includes('..')) errors.push(`${label}.id güvenli bir varlık kimliği olmalı.`)
    else if (ids.has(entry.id)) errors.push(`${label}.id tekrarlanıyor: ${entry.id}.`)
    else ids.add(entry.id)
    if (typeof entry.name !== 'string' || !entry.name.trim()) errors.push(`${label}.name boş olmayan bir metin olmalı.`)
    if (typeof entry.file !== 'string' || !entry.file.toLowerCase().endsWith('.glb')) {
      errors.push(`${label}.file, models dizini altındaki göreli bir .glb yolu olmalı.`)
    } else {
      const segments = entry.file.split('/')
      if (entry.file.startsWith('/') || entry.file.includes('\\') || entry.file.includes('%') || entry.file.includes('?') || entry.file.includes('#')
        || segments.some((segment) => !FILE_SEGMENT.test(segment) || segment === '.' || segment === '..')) {
        errors.push(`${label}.file güvenli bir göreli yol olmalı; models dizini dışına çıkamaz.`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

export function resolveGlbModelCatalog(value: unknown): GlbCatalogAsset[] {
  const validation = validateGlbModelCatalog(value)
  if (!validation.valid) throw new Error(`GLB model kataloğu geçersiz: ${validation.errors.join(' ')}`)
  return (value as GlbModelCatalog).models.map((model) => ({
    ...model,
    url: `/models/${model.file.split('/').map(encodeURIComponent).join('/')}`,
  }))
}

export function getGlbCatalogAsset(assetId: string, assets: Record<string, GlbCatalogAsset>): GlbCatalogAsset | null {
  return assets[assetId] ?? null
}

export async function loadGlbModelCatalog(fetcher: typeof fetch = fetch): Promise<GlbCatalogAsset[]> {
  const response = await fetcher('/models/catalog.json', { cache: 'no-store' })
  if (!response.ok) throw new Error(`GLB model kataloğu yüklenemedi (${response.status}).`)
  return resolveGlbModelCatalog(await response.json() as unknown)
}
