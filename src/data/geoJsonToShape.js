import * as THREE from 'three'

/** @typedef {import('../types/campus').Position} Position */
/** @typedef {import('../types/campus').CampusGeometry} CampusGeometry */

/**
 * Add a closed GeoJSON linear ring to a Three.js path. GeoJSON repeats the first
 * point at the end; Shape/Path closes the contour itself.
 * @param {THREE.Shape | THREE.Path} path
 * @param {Position[]} ring
 * @param {(position: [number, number]) => [number, number]} project
 */
function appendRing(path, ring, project) {
  const points = ring.slice()
  if (points.length > 1 && points[0][0] === points.at(-1)?.[0] && points[0][1] === points.at(-1)?.[1]) {
    points.pop()
  }
  if (points.length < 3) throw new Error('A GeoJSON ring needs at least three distinct points.')
  const first = project([points[0][0], points[0][1]])
  path.moveTo(first[0], first[1])
  for (const point of points.slice(1)) {
    const projected = project([point[0], point[1]])
    path.lineTo(projected[0], projected[1])
  }
  path.closePath()
}

/** Convert one GeoJSON Polygon, including interior rings, to a Three Shape. */
export function polygonToShape(rings, project) {
  if (!rings.length) throw new Error('Polygon has no outer ring.')
  const shape = new THREE.Shape()
  appendRing(shape, rings[0], project)
  for (const holeRing of rings.slice(1)) {
    const hole = new THREE.Path()
    appendRing(hole, holeRing, project)
    shape.holes.push(hole)
  }
  return shape
}

/** Convert Polygon and every part of a MultiPolygon without dropping holes. */
export function geometryToShapes(geometry, project) {
  if (geometry.type === 'Polygon') return [polygonToShape(geometry.coordinates, project)]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.map((polygon) => polygonToShape(polygon, project))
  throw new Error(`Unsupported building geometry: ${geometry.type}`)
}
