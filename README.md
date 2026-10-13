# Göztepe Campus 3D

An independent, stylized 3D campus model built with React 19, TypeScript, Vite, Three.js, React Three Fiber v9, and Drei. It uses local copies of the source project's GeoJSON; the source map application is not a runtime dependency.

## Run it

```sh
npm install
npm run dev
```

Build and preview:

```sh
npm run build
npm run preview
npm run validate:data
```

## Prototype features

- Converts the 58 campus building footprints from WGS84 coordinates into local meter-based X/Z coordinates.
- Converts Polygon and MultiPolygon rings into Three.js Shapes, preserving interior rings as holes, then extrudes each footprint into a building mass.
- Provides a simple campus ground, soft lighting, shadows, and damped OrbitControls.
- Clicking a building highlights it and displays its resolved name, linked Marmara units, OSM ID, and height-confidence label.
- Keeps future presentation-only building edits separate in `public/data/building-visual-overrides.json`.

## Data files

- `public/data/goztepe-buildings-3d.geojson`: 58 source building footprints and their current display-height fields.
- `public/data/building-overrides.json`: source project name/unit/review overrides, copied independently.
- `public/data/goztepe-boundary.geojson`: campus perimeter.
- `public/data/building-visual-overrides.json`: initially empty, separate 3D presentation override map.

Sources, attribution, and licensing notes are documented in [DATA_SOURCES.md](DATA_SOURCES.md). The geometry and height data are not survey-grade. Fifty current heights are placeholders; the remaining eight are inferred from OpenStreetMap floor counts.

## Next stage

1. Confirm the visual scale and footprint placement with a campus-wide scene review.
2. Improve building heights and roofs using verified plans or measurements; keep provenance with each value.
3. Add editor mode with building selection/transform and a placement palette for trees and sidewalks. Persist user-created objects separately from source GeoJSON.
4. Add first-person walking mode and collision handling after the editable model is stable.

The building model is intentionally a massing prototype. It does not yet include detailed facades, editable footprint vertices, trees, sidewalks, or walking controls.
