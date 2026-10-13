export type Position = [longitude: number, latitude: number, ...rest: number[]]

export type PolygonGeometry = {
  type: 'Polygon'
  coordinates: Position[][]
}

export type MultiPolygonGeometry = {
  type: 'MultiPolygon'
  coordinates: Position[][][]
}

export type LineStringGeometry = { type: 'LineString'; coordinates: Position[] }

export type WalkwayProperties = {
  osmId?: string | number
  highway?: string
  name?: string
  width?: string | number
  access?: string
  foot?: string
  roadId?: string
  segmentId?: string
  widthMeters?: number
  displayColor?: string
  visible?: boolean
  [key: string]: unknown
}

export type WalkwayOverride = {
  widthMeters?: number
  color?: string
  visible?: boolean
  /** Local east/north coordinates in meters; applied to this clipped segment. */
  coordinates?: [number, number][]
}

export type WalkwayOverrides = {
  version: number
  coordinateSpace: 'local-meters-east-north'
  roads: Record<string, WalkwayOverride>
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
  walkways: FeatureCollection<LineStringGeometry, WalkwayProperties>
  walkwayOverrides: WalkwayOverrides
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
