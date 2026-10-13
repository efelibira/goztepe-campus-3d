import { projectPosition } from './projectCoordinates.js'

function pointInRing(x, z, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i]
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}

/** Pre-project a Polygon/MultiPolygon boundary once and return a local-meter containment check. */
export function createCampusContainment(geometry) {
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((rings) => rings.map((ring) => ring.map(([longitude, latitude]) => {
    const [east, north] = projectPosition([longitude, latitude])
    return [east, -north]
  })))

  return (x, z) => polygons.some((rings) => pointInRing(x, z, rings[0])
    && !rings.slice(1).some((hole) => pointInRing(x, z, hole)))
}
