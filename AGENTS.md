# Agent instructions for goztepe-campus-3d

- This is a standalone application. Never import source files at runtime from `goztepe-campus-map`; use only this project's local data copies.
- Do not modify the separate `goztepe-campus-map` repository or its branches as part of work in this project.
- Preserve OSM feature IDs (`way/...` and `relation/...`) as building IDs. Normalize the `osm:` prefix only when looking up source overrides.
- Keep source GeoJSON immutable. Put visual edits in `public/data/building-visual-overrides.json`; put user-placed objects in their own persisted scene document when that feature is added.
- `displayHeight` is not always measured. Preserve and display its `heightSource`; `placeholder` values are estimates. OSM floor-count conversions are estimates too.
- Convert WGS84 coordinates through `src/data/projectCoordinates.js`; keep Y as elevation and the campus footprint on the X/Z plane.
- Polygon interior rings represent holes. Do not drop them when generating `Shape`/`ExtrudeGeometry`; handle every polygon in MultiPolygon features.
- Keep the first-person walking mode and edit/placement mode separate so camera and pointer controls do not fight each other.
- Preserve data attribution in `DATA_SOURCES.md` and the application interface. Re-check source licensing before publishing altered or redistributed source data.
- Avoid adding dependencies until a concrete feature needs them. Keep README and this file updated when the architecture changes.
