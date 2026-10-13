import fs from 'node:fs'
import * as THREE from 'three'
import { geometryToShapes } from '../src/data/geoJsonToShape.js'
import { projectPosition } from '../src/data/projectCoordinates.js'

const base = new URL('../public/data/', import.meta.url)
const buildings = JSON.parse(fs.readFileSync(new URL('goztepe-buildings-3d.geojson', base), 'utf8'))
const boundary = JSON.parse(fs.readFileSync(new URL('goztepe-boundary.geojson', base), 'utf8'))
const overrides = JSON.parse(fs.readFileSync(new URL('building-overrides.json', base), 'utf8'))

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
console.log(`Validated ${ids.size} buildings, ${parts} polygon parts, ${holes} interior rings, ${extrusions} extruded meshes, and ${boundary.features.length} campus boundary feature.`)
console.log(`OSM override records available: ${Object.keys(overrides.buildings ?? {}).length}.`)
