import type { FeatureCollection, LineStringGeometry, WalkwayProperties, PolygonGeometry, WalkwayOverrides } from '../types/campus'

export function walkwayWidth(properties?: WalkwayProperties): number
export function clipWalkwaysToBoundary(
  collection: FeatureCollection<LineStringGeometry, WalkwayProperties>,
  boundary: PolygonGeometry,
  project: (position: [number, number]) => [number, number],
): {
  collection: FeatureCollection<LineStringGeometry, WalkwayProperties & { widthMeters: number; sourceFeatureIndex: number; segmentIndex: number }>
  sourceFeatures: number
  intersectingFeatures: number
  outsideFeatures: number
  projectedRings: number[][][]
}
export function applyWalkwayOverrides(
  collection: FeatureCollection<LineStringGeometry, WalkwayProperties>,
  overrideFile: WalkwayOverrides,
): FeatureCollection<LineStringGeometry, WalkwayProperties>
export function walkwayToShape(points: [number, number][], width: number): import('three').Shape
