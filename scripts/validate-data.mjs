import fs from 'node:fs'
import * as THREE from 'three'
import { geometryToShapes } from '../src/data/geoJsonToShape.js'
import { projectPosition } from '../src/data/projectCoordinates.js'
import { applyWalkwayOverrides, clipWalkwaysToBoundary, walkwayToShape } from '../src/data/walkways.js'
import { CAMERA_CONFIG, CAMERA_DISTANCE_LIMITS, CAMPUS_GROUND_SIZE } from '../src/scene/cameraConfig.js'

const base = new URL('../public/data/', import.meta.url)
const buildings = JSON.parse(fs.readFileSync(new URL('goztepe-buildings-3d.geojson', base), 'utf8'))
const boundary = JSON.parse(fs.readFileSync(new URL('goztepe-boundary.geojson', base), 'utf8'))
const overrides = JSON.parse(fs.readFileSync(new URL('building-overrides.json', base), 'utf8'))
const walkways = JSON.parse(fs.readFileSync(new URL('goztepe-walkways.geojson', base), 'utf8'))
const walkwayOverrides = JSON.parse(fs.readFileSync(new URL('walkway-overrides.json', base), 'utf8'))

function assertClosedRing(ring, label) {
  if (!Array.isArray(ring) || ring.length < 4) throw new Error(`${label}: ring has fewer than 4 coordinates.`)
  const first = ring[0], last = ring.at(-1)
  if (first[0] !== last[0] || first[1] !== last[1]) throw new Error(`${label}: ring is not closed.`)
  for (const position of ring) {
    if (!Number.isFinite(position[0]) || !Number.isFinite(position[1])) throw new Error(`${label}: invalid coordinate.`)
  }
}

if (buildings.features.length !== 58) throw new Error(`Expected 58 building features, got ${buildings.features.length}.`)
const ids = new Set()
let parts = 0, holes = 0, extrusions = 0
for (const feature of buildings.features) {
  const id = String(feature.id ?? feature.properties?.['@id'] ?? '')
  if (!id) throw new Error('Building without stable OSM id.')
  if (ids.has(id)) throw new Error(`Duplicate building id: ${id}`)
  ids.add(id)
  const geometry = feature.geometry
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : null
  if (!polygons) throw new Error(`${id}: unsupported geometry ${geometry.type}`)
  for (const [polygonIndex, rings] of polygons.entries()) {
    for (const [ringIndex, ring] of rings.entries()) assertClosedRing(ring, `${id} polygon ${polygonIndex} ring ${ringIndex}`)
    holes += Math.max(0, rings.length - 1)
  }
  const shapes = geometryToShapes(geometry, projectPosition)
  parts += shapes.length
  const height = Number(feature.properties?.displayHeight)
  if (!(height > 0)) throw new Error(`${id}: invalid extrusion height.`)
  for (const shape of shapes) {
    const meshGeometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 })
    meshGeometry.computeBoundingBox()
    const box = meshGeometry.boundingBox
    if (!box || ![box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite)) {
      throw new Error(`${id}: extrusion produced invalid bounds.`)
    }
    if (meshGeometry.index?.count === 0) throw new Error(`${id}: extrusion has no triangles.`)
    extrusions++
    meshGeometry.dispose()
  }
}
for (const feature of boundary.features) {
  geometryToShapes(feature.geometry, projectPosition)
}
if (walkways.features.length !== 631) throw new Error(`Expected 631 source walkway features, got ${walkways.features.length}.`)
if (walkways.features.some((f) => f.geometry?.type !== 'LineString')) throw new Error('Walkway dataset contains a non-LineString feature.')
const invalidWalkways = walkways.features.filter((f) => f.geometry.coordinates.length < 2 || f.geometry.coordinates.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1])))
if (invalidWalkways.length) throw new Error(`${invalidWalkways.length} walkway source geometries have too few or invalid coordinates.`)
const clipped = clipWalkwaysToBoundary(walkways, boundary.features[0].geometry, projectPosition)
if (!clipped.collection.features.length) throw new Error('No walkway geometry was clipped inside the campus boundary.')
const walkwaySegmentIds = clipped.collection.features.map((feature) => feature.properties.segmentId)
if (walkwaySegmentIds.some((id) => typeof id !== 'string' || !id.startsWith('road-')) || new Set(walkwaySegmentIds).size !== walkwaySegmentIds.length) throw new Error('Walkway segment IDs are missing or duplicated.')
const reordered = clipWalkwaysToBoundary({ ...walkways, features: [...walkways.features].reverse() }, boundary.features[0].geometry, projectPosition)
if (JSON.stringify([...walkwaySegmentIds].sort()) !== JSON.stringify(reordered.collection.features.map((feature) => feature.properties.segmentId).sort())) throw new Error('Walkway IDs changed when source feature order was reversed.')
if (walkwayOverrides.version !== 1 || walkwayOverrides.coordinateSpace !== 'local-meters-east-north' || !walkwayOverrides.roads) throw new Error('Walkway override file has an unsupported schema.')
const previewOverride = { roads: { [walkwaySegmentIds[0]]: { widthMeters: 2.4, color: '#555879', visible: false, coordinates: [[1, 2], [3, 4]] } } }
const overridePreview = applyWalkwayOverrides(clipped.collection, previewOverride).features[0]
if (overridePreview.properties.widthMeters !== 2.4 || overridePreview.properties.displayColor !== '#555879' || overridePreview.properties.visible !== false || overridePreview.geometry.coordinates[0][0] !== 1) throw new Error('Walkway override fields are not applied.')
let walkwayMeshes = 0
for (const feature of clipped.collection.features) {
  const shape = walkwayToShape(feature.geometry.coordinates, feature.properties.widthMeters)
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds || ![bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y].every(Number.isFinite)) throw new Error(`Walkway ${feature.id}: invalid surface bounds.`)
  if (geometry.index?.count < 3 || !(bounds.max.x > bounds.min.x) || !(bounds.max.y > bounds.min.y)) throw new Error(`Walkway ${feature.id}: empty or degenerate surface.`)
  walkwayMeshes++
  geometry.dispose()
}
const roadsWithWidthTag = walkways.features.filter((f) => Number.parseFloat(String(f.properties?.width ?? '').replace(',', '.')) > 0).length
const highwayCounts = walkways.features.reduce((acc, f) => (acc[f.properties?.highway ?? 'unknown'] = (acc[f.properties?.highway ?? 'unknown'] ?? 0) + 1, acc), {})
function pointInRing(point, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i]
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
const buildingRings = buildings.features.map((f) => {
  const polygon = f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat()
  return polygon.map((ring) => ring.map((p) => projectPosition([p[0], p[1]])))
})
const touchingBuildingIds = new Set()
for (const feature of clipped.collection.features) {
  const points = feature.geometry.coordinates
  let overlaps = false
  for (let i = 0; i < points.length - 1 && !overlaps; i++) {
    const a = points[i], b = points[i + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    for (let step = 0; step <= Math.ceil(length / 2) && !overlaps; step++) {
      const t = Math.min(1, step * 2 / Math.max(length, 1e-9))
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      if (buildingRings.some((rings) => pointInRing(p, rings[0]) && !rings.slice(1).some((hole) => pointInRing(p, hole)))) overlaps = true
    }
  }
  if (overlaps) touchingBuildingIds.add(String(feature.id))
}
const campusGroundRadius = Math.hypot(CAMPUS_GROUND_SIZE / 2, CAMPUS_GROUND_SIZE / 2)
if (!(CAMERA_CONFIG.near < CAMERA_DISTANCE_LIMITS.min) || !(CAMERA_CONFIG.far > CAMERA_DISTANCE_LIMITS.max + campusGroundRadius)) throw new Error('Camera near/far planes do not cover the closest and farthest campus views.')
console.log(`Validated ${ids.size} buildings, ${parts} polygon parts, ${holes} interior rings, ${extrusions} extruded meshes, and ${boundary.features.length} campus boundary feature.`)
console.log(`OSM override records available: ${Object.keys(overrides.buildings ?? {}).length}.`)
console.log(`Walkways: ${clipped.sourceFeatures} source LineStrings; ${invalidWalkways.length} invalid; ${clipped.intersectingFeatures} intersect campus; ${clipped.outsideFeatures} fully outside; ${walkwayMeshes} clipped surface geometries created.`)
console.log(`Walkways without usable OSM width tag: ${walkways.features.length - roadsWithWidthTag}; highway types: ${Object.entries(highwayCounts).map(([k, v]) => `${k}=${v}`).join(', ')}.`)
console.log(`Building-footprint check: ${touchingBuildingIds.size} clipped path segments cross a building footprint; path surfaces sit 0.12 m below building bases so buildings occlude them.`)
console.log(`Stable walkway IDs verified across reversed source order; override fields verified (width, color, visibility, local-meter points).`)
console.log(`Camera visibility envelope: nearest orbit ${CAMERA_DISTANCE_LIMITS.min} m > near ${CAMERA_CONFIG.near} m; far orbit + ground corner ${(CAMERA_DISTANCE_LIMITS.max + campusGroundRadius).toFixed(1)} m < far ${CAMERA_CONFIG.far} m.`)
