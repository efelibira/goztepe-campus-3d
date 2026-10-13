import type {
  BuildingOverride,
  BuildingVisualOverrides,
  CampusData,
  CampusGeometry,
  BuildingProperties,
  FeatureCollection,
  PolygonGeometry,
} from '../types/campus'

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path} yüklenemedi (${response.status}).`)
  return response.json() as Promise<T>
}

export async function loadCampusData(): Promise<CampusData> {
  const [buildings, boundary, overrideFile, visualOverrides] = await Promise.all([
    fetchJson<FeatureCollection<CampusGeometry, BuildingProperties>>('/data/goztepe-buildings-3d.geojson'),
    fetchJson<FeatureCollection<PolygonGeometry, Record<string, never>>>('/data/goztepe-boundary.geojson'),
    fetchJson<{ buildings: Record<string, BuildingOverride> }>('/data/building-overrides.json'),
    fetchJson<BuildingVisualOverrides>('/data/building-visual-overrides.json'),
  ])

  if (buildings.features.length !== 58) {
    throw new Error(`58 bina bekleniyordu; ${buildings.features.length} bina bulundu.`)
  }
  if (!overrideFile.buildings || !visualOverrides.buildings) {
    throw new Error('Bina düzeltme dosyalarının biçimi beklenenden farklı.')
  }

  return {
    buildings,
    boundary,
    overrides: overrideFile.buildings,
    visualOverrides,
  }
}
