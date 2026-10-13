import type {
  BuildingOverride,
  BuildingVisualOverrides,
  CampusData,
  CampusGeometry,
  BuildingProperties,
  FeatureCollection,
  PolygonGeometry,
  LineStringGeometry,
  WalkwayProperties,
  WalkwayOverrides,
} from '../types/campus'
import { applyWalkwayOverrides, clipWalkwaysToBoundary } from './walkways.js'
import { projectPosition } from './projectCoordinates.js'

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path} yüklenemedi (${response.status}).`)
  return response.json() as Promise<T>
}

export async function loadCampusData(): Promise<CampusData> {
  const [buildings, boundary, rawWalkways, walkwayOverrideFile, overrideFile, visualOverrides] = await Promise.all([
    fetchJson<FeatureCollection<CampusGeometry, BuildingProperties>>('/data/goztepe-buildings-3d.geojson'),
    fetchJson<FeatureCollection<PolygonGeometry, Record<string, never>>>('/data/goztepe-boundary.geojson'),
    fetchJson<FeatureCollection<LineStringGeometry, WalkwayProperties>>('/data/goztepe-walkways.geojson'),
    fetchJson<WalkwayOverrides>('/data/walkway-overrides.json'),
    fetchJson<{ buildings: Record<string, BuildingOverride> }>('/data/building-overrides.json'),
    fetchJson<BuildingVisualOverrides>('/data/building-visual-overrides.json'),
  ])

  if (buildings.features.length !== 58) {
    throw new Error(`58 bina bekleniyordu; ${buildings.features.length} bina bulundu.`)
  }
  if (!overrideFile.buildings || !visualOverrides.buildings) {
    throw new Error('Bina düzeltme dosyalarının biçimi beklenenden farklı.')
  }
  const clippedWalkways = clipWalkwaysToBoundary(rawWalkways, boundary.features[0].geometry, projectPosition)
  if (walkwayOverrideFile.version !== 1 || !walkwayOverrideFile.roads) throw new Error('Yaya yolu düzeltme dosyasının biçimi beklenenden farklı.')

  return {
    buildings,
    boundary,
    walkways: applyWalkwayOverrides(clippedWalkways.collection, walkwayOverrideFile),
    walkwayOverrides: walkwayOverrideFile,
    overrides: overrideFile.buildings,
    visualOverrides,
  }
}
