export type Position = [longitude: number, latitude: number, ...rest: number[]]

export type PolygonGeometry = {
  type: 'Polygon'
  coordinates: Position[][]
}

export type MultiPolygonGeometry = {
  type: 'MultiPolygon'
  coordinates: Position[][][]
}

export type CampusGeometry = PolygonGeometry | MultiPolygonGeometry

export type MarmaraUnit = {
  name: string
  category?: string
  website?: string | null
}

export type BuildingProperties = {
  '@id'?: string
  name?: string
  'building:levels'?: string | number
  height?: string | number
  displayHeight?: number | string
  heightSource?: 'osm-levels' | 'placeholder' | string
  marmaraUnits?: MarmaraUnit[] | string
  [key: string]: unknown
}

export type GeoJsonFeature<G, P> = {
  type: 'Feature'
  id?: string | number
  geometry: G
  properties: P
}

export type FeatureCollection<G, P> = {
  type: 'FeatureCollection'
  features: GeoJsonFeature<G, P>[]
}

export type BuildingOverride = {
  name?: string
  units?: MarmaraUnit[]
  status?: 'unreviewed' | 'uncertain' | 'verified' | string
}

export type BuildingVisualOverride = {
  heightMeters?: number
  heightConfidence?: 'verified' | 'estimated'
  color?: string
}

export type BuildingVisualOverrides = {
  version: number
  buildings: Record<string, BuildingVisualOverride>
}

export type CampusData = {
  buildings: FeatureCollection<CampusGeometry, BuildingProperties>
  boundary: FeatureCollection<PolygonGeometry, Record<string, never>>
  overrides: Record<string, BuildingOverride>
  visualOverrides: BuildingVisualOverrides
}

export type ResolvedBuilding = {
  id: string
  name: string
  units: MarmaraUnit[]
  heightMeters: number
  heightLabel: string
  confidenceLabel: string
  color?: string
  feature: GeoJsonFeature<CampusGeometry, BuildingProperties>
}
