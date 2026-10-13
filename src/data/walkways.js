import * as THREE from 'three'

const EPS = 1e-9

export function walkwayWidth(properties = {}) {
  const tagged = Number.parseFloat(String(properties.width ?? '').replace(',', '.'))
  if (Number.isFinite(tagged) && tagged > 0) return tagged
  return ({ footway: 1.8, steps: 1.6, pedestrian: 3, service: 3.2, residential: 5, living_street: 4 })[properties.highway] ?? 2
}

function cross(a, b) { return a[0] * b[1] - a[1] * b[0] }
function same(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6 }

function stableHash(value) {
  const text = JSON.stringify(value)
  let first = 0x811c9dc5, second = 0x9e3779b9
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

function canonicalLine(coordinates) {
  const forward = JSON.stringify(coordinates)
  const reverse = JSON.stringify([...coordinates].reverse())
  return forward <= reverse ? coordinates : [...coordinates].reverse()
}

function stableRoadId(feature) {
  const properties = Object.fromEntries(Object.entries(feature.properties ?? {}).sort(([a], [b]) => a.localeCompare(b)))
  return `road-${stableHash({ properties, coordinates: canonicalLine(feature.geometry.coordinates) })}`
}

function pointInRings(point, rings) {
  let inside = false
  for (const ring of rings) {
    let ringInside = false
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i]
      const ab = [b[0] - a[0], b[1] - a[1]], ap = [point[0] - a[0], point[1] - a[1]]
      if (Math.abs(cross(ab, ap)) < 1e-7 && ap[0] * (point[0] - b[0]) + ap[1] * (point[1] - b[1]) <= 1e-7) return true
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) ringInside = !ringInside
    }
    if (ringInside) inside = !inside
  }
  return inside
}

function intersectionT(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]]
  const denominator = cross(r, s)
  if (Math.abs(denominator) < EPS) return null
  const ca = [c[0] - a[0], c[1] - a[1]]
  const t = cross(ca, s) / denominator, u = cross(ca, r) / denominator
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? Math.max(0, Math.min(1, t)) : null
}

function clipSegment(a, b, rings) {
  const cuts = [0, 1]
  for (const ring of rings) for (let i = 0; i < ring.length - 1; i++) {
    const t = intersectionT(a, b, ring[i], ring[i + 1])
    if (t !== null) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  const unique = cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > EPS)
  const parts = []
  for (let i = 0; i < unique.length - 1; i++) {
    const t0 = unique[i], t1 = unique[i + 1], mid = (t0 + t1) / 2
    const test = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid]
    if (!pointInRings(test, rings) || t1 - t0 < EPS) continue
    parts.push([
      [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
      [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
    ])
  }
  return parts
}

/** Clips projected WGS84 LineStrings to the Polygon/MultiPolygon campus boundary. */
export function clipWalkwaysToBoundary(collection, boundary, project) {
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.coordinates
  const projectedRings = polygons.flatMap((polygon) => polygon.map((ring) => ring.map((p) => project([p[0], p[1]]))))
  const features = [], crossedIds = new Set(), outsideIds = new Set()
  let sourceFeatures = 0
  for (const feature of collection.features) {
    sourceFeatures++
    const roadId = stableRoadId(feature)
    const coords = feature.geometry.coordinates.map((p) => project([p[0], p[1]]))
    let current = [], outputParts = []
    for (let i = 0; i < coords.length - 1; i++) {
      const clipped = clipSegment(coords[i], coords[i + 1], projectedRings)
      for (const segment of clipped) {
        if (current.length && same(current.at(-1), segment[0])) current.push(segment[1])
        else { if (current.length > 1) outputParts.push(current); current = [...segment] }
      }
      if (!clipped.length && current.length > 1) { outputParts.push(current); current = [] }
      if (clipped.length && clipped.at(-1)[1] && !same(clipped.at(-1)[1], coords[i + 1])) {
        if (current.length > 1) outputParts.push(current)
        current = []
      }
    }
    if (current.length > 1) outputParts.push(current)
    if (!outputParts.length) { outsideIds.add(String(feature.properties?.osmId ?? feature.id ?? sourceFeatures)); continue }
    crossedIds.add(String(feature.properties?.osmId ?? feature.id ?? sourceFeatures))
    for (const [segmentIndex, part] of outputParts.entries()) {
      if (part.length < 2 || part.reduce((length, p, i) => i ? length + Math.hypot(p[0] - part[i - 1][0], p[1] - part[i - 1][1]) : 0, 0) < 0.02) continue
      const segmentId = `${roadId}-${stableHash(canonicalLine(part))}`
      features.push({
        type: 'Feature', id: segmentId,
        geometry: { type: 'LineString', coordinates: part.map(([x, y]) => [x, y]) },
        properties: { ...feature.properties, roadId, segmentId, widthMeters: walkwayWidth(feature.properties), sourceFeatureIndex: sourceFeatures - 1, segmentIndex },
      })
    }
  }
  return { collection: { type: 'FeatureCollection', features }, sourceFeatures, intersectingFeatures: crossedIds.size, outsideFeatures: outsideIds.size, projectedRings }
}

/** Apply user-managed values without mutating source GeoJSON properties. */
export function applyWalkwayOverrides(collection, overrideFile) {
  const overrides = overrideFile?.roads ?? {}
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const override = overrides[feature.properties.segmentId] ?? overrides[feature.properties.roadId] ?? {}
      return {
        ...feature,
        geometry: override.coordinates ? { type: 'LineString', coordinates: override.coordinates } : feature.geometry,
        properties: {
          ...feature.properties,
          widthMeters: Number.isFinite(override.widthMeters) && override.widthMeters > 0 ? override.widthMeters : feature.properties.widthMeters,
          displayColor: typeof override.color === 'string' ? override.color : undefined,
          visible: override.visible !== false,
        },
      }
    }),
  }
}

/** Builds a miter-joined 2D ribbon Shape from local-meter points. */
export function walkwayToShape(points, width) {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-4)
  if (clean.length < 2) throw new Error('Walkway requires at least two distinct points.')
  const half = width / 2
  const side = (sign) => clean.map((point, i) => {
    const before = clean[Math.max(0, i - 1)], after = clean[Math.min(clean.length - 1, i + 1)]
    const unit = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
      return len < 1e-8 ? [0, 0] : [-dy / len, dx / len]
    }
    const n0 = unit(before, point), n1 = unit(point, after)
    let nx = n0[0] + n1[0], ny = n0[1] + n1[1], nlen = Math.hypot(nx, ny)
    if (nlen < 1e-8) { nx = n1[0] || n0[0]; ny = n1[1] || n0[1]; nlen = Math.hypot(nx, ny) }
    nx /= nlen || 1; ny /= nlen || 1
    const denominator = Math.max(0.25, Math.abs(nx * n1[0] + ny * n1[1]))
    const scale = Math.min(half / denominator, half * 2.5)
    return [point[0] + nx * scale * sign, point[1] + ny * scale * sign]
  })
  const left = side(1), right = side(-1), outline = [...left, ...right.reverse()]
  const shape = new THREE.Shape()
  shape.moveTo(outline[0][0], outline[0][1])
  for (const point of outline.slice(1)) shape.lineTo(point[0], point[1])
  shape.closePath()
  return shape
}
