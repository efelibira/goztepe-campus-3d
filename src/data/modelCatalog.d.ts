export type GlbCatalogRecord = { id: string; name: string; file: string }
export type GlbCatalogAsset = GlbCatalogRecord & { url: string }
export type GlbModelCatalog = { version: 1; models: GlbCatalogRecord[] }
export function validateGlbModelCatalog(value: unknown): { valid: boolean; errors: string[] }
export function resolveGlbModelCatalog(value: unknown): GlbCatalogAsset[]
export function getGlbCatalogAsset(assetId: string, assets: Record<string, GlbCatalogAsset>): GlbCatalogAsset | null
export function loadGlbModelCatalog(fetcher?: typeof fetch): Promise<GlbCatalogAsset[]>
