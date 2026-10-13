# Data sources, attribution, and reuse notes

This project contains independent local copies of three data files from the separate `goztepe-campus-map` project. The copied source files are retained without changing their GeoJSON feature records:

- `public/data/goztepe-buildings-3d.geojson` — OSM building polygons and tags, joined with Marmara University point-of-interest matches, plus derived `displayHeight` and `heightSource` fields.
- `public/data/building-overrides.json` — curated display names, unit associations, and review states from the source project.
- `public/data/goztepe-boundary.geojson` — the campus perimeter.

The source repository did not include a repository-level LICENSE/NOTICE file. The building geometry and tags identify OpenStreetMap elements (`way/...` and `relation/...`). OpenStreetMap data is provided under the Open Database License (ODbL); retain visible attribution and link the ODbL/copyright terms wherever the dataset or an adaptation is distributed. The app includes an attribution link in its interface. See [OpenStreetMap Copyright and License](https://www.openstreetmap.org/copyright).

The POI matches and curated unit names were derived from the [Marmara University Campus Map](https://www.marmara.edu.tr/kampus-haritasi). This project attributes that source and preserves its source links. No explicit reuse license for the university's directory content was found in the source project; do not assume it is relicensed under ODbL. Confirm permission/terms with the university before publicly redistributing those records or presenting the university as an endorser.

`displayHeight` and `heightSource` are project-derived presentation fields, not OpenStreetMap measurements. `osm-levels` means an approximate 3 m-per-floor conversion from OSM `building:levels`; `placeholder` means the source project assigned a temporary 12 m height. Keep these confidence labels visible and do not describe them as surveyed heights.

The source copy currently has 58 campus building features: 55 Polygon and 3 MultiPolygon. `building-overrides.json` uses IDs prefixed with `osm:` while GeoJSON feature IDs use `way/...` or `relation/...`; normalize this prefix when resolving overrides, while retaining the original OSM ID as the stable object key.
