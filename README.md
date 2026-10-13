# Göztepe Campus 3D

An independent, stylized 3D campus model built with React 19, TypeScript, Vite, Three.js, React Three Fiber v9, and Drei. It uses local copies of the source project's GeoJSON; the source map application is not a runtime dependency.

For continuity across AI tools, see [AI_HANDOFF.md](AI_HANDOFF.md) for the current architecture, validation gates, and model-library constraints.

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
npm test
```

## Prototype features

- Converts the 58 campus building footprints from WGS84 coordinates into local meter-based X/Z coordinates.
- Converts Polygon and MultiPolygon rings into Three.js Shapes, preserving interior rings as holes, then extrudes each footprint into a building mass.
- Provides a simple campus ground, soft lighting, shadows, and damped OrbitControls.
- Clicking a building highlights it and displays its resolved name, linked Marmara units, OSM ID, and height-confidence label.
- Keeps baseline presentation values in `public/data/building-visual-overrides.json` and user building edits in the versioned scene document; source building GeoJSON remains unchanged.
- Lets edit-mode users select any of the 58 source buildings and edit its display name, height, facade/roof colors, and visibility. Every field can be reset to its resolved source/default value.
- Stores source-building overrides separately from placed scene objects and includes both groups in autosave, JSON import/export, validation, and undo/redo.
- Defines an optional per-building GLB model contract. Missing or failed GLB assets fall back to the automatic GeoJSON massing model.
- Uses one validated GLB catalog for both source-building replacements and reusable placed GLB objects. Placed models keep the asset ID, unique object ID, transform, and custom name in the existing scene document; model binaries stay under `public/models/`.
- Provides a small procedural object library and a framework-independent object store with validation, import/export, localStorage autosave, and bounded undo/redo history.
- Separates normal viewing from edit mode; supports campus-ground placement, selection, transform gizmos, deletion, and scene JSON import/export.
- In Object mode, directly drag any placed model body to move it on a horizontal X/Z plane. The initial pointer offset and object height are preserved, campus holes/outside areas are rejected, and the drag commits as one undo step.
- In edit mode, switches between Camera and Object controls. Object mode reserves left-drag for object work, while Option + left-drag rotates the camera; right-drag pans in both modes.

## Data files

- `public/data/goztepe-buildings-3d.geojson`: 58 source building footprints and their current display-height fields.
- `public/data/building-overrides.json`: source project name/unit/review overrides, copied independently.
- `public/data/goztepe-boundary.geojson`: campus perimeter.
- `public/data/building-visual-overrides.json`: initially empty, separate 3D presentation override map.
- `public/data/walkway-overrides.json`: separate presentation overrides for clipped paths.
- `public/models/catalog.json`: centralized GLB asset IDs, display names, and paths relative to `public/models/`. The existing `binadeneme.glb` is registered as `binadeneme`; keep this ID stable once used in scenes.
- `public/models/buildings/` and `public/models/objects/`: suggested locations for building and reusable object GLBs.
- `public/schemas/scene-document.v1.schema.json`: preserved version 1 JSON Schema for older placed-object records.
- `public/schemas/scene-document.v2.schema.json`: version 2 JSON Schema for separate placed objects and source-building overrides.
- `public/schemas/model-catalog.v1.schema.json`: JSON Schema for the GLB asset catalog.

## Scene object editing foundation

The existing buildings remain source features resolved from GeoJSON. User-created objects are stored separately in a `SceneDocument` and rendered by `PlacedObjectsLayer`; source features are never edited by the object store.

Each placed object has a persistent unique `id`, `objectType`, `variant`, a transform (`position`, `rotation`, and positive `scale` vectors), and a `properties` record for model-specific settings. The starter library defines `rectangular-building`, `tree`, `bench`, and `gazebo`. Their procedural React Three Fiber model components are independent of saved object records. The renderer registry supports procedural components and lazy-loaded GLB assets, so a variant can switch renderers without changing saved scene records.

The version 2 document keeps user-placed objects and source building edits separate:

```json
{
  "version": 2,
  "objects": [
    {
      "id": "stable-unique-id",
      "objectType": "tree",
      "variant": "round-canopy",
      "transform": {
        "position": [120, 0, -45],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "properties": {
        "height": 6,
        "canopyRadius": 1.8,
        "trunkRadius": 0.22,
        "color": "#A8B99A"
      }
    }
  ],
  "buildingOverrides": {
    "way/123456": {
      "name": "Fen-Edebiyat Fakültesi",
      "heightMeters": 18,
      "facadeColor": "#98A1BC",
      "roofColor": "#DED3C4",
      "visible": true,
      "model": {
        "type": "glb",
        "assetId": "fen-edebiyat-model",
        "scale": [1, 1, 1],
        "rotation": [0, 0, 0],
        "offset": [0, 0, 0]
      }
    }
  }
}
```

The complete machine-readable schema is [scene-document.v2.schema.json](public/schemas/scene-document.v2.schema.json). Version 1 records remain accepted and are upgraded in memory with an empty `buildingOverrides` map; the v1 schema and old localStorage key remain readable. New records persist under `goztepe-campus-3d:scene:v2`. Runtime validation rejects unsupported versions, duplicate object IDs, malformed transforms, invalid building fields, and unsafe GLB asset IDs before data enters the store. `parseSceneDocument` and `serializeSceneDocument` provide JSON import/export. A failed JSON import leaves the current scene intact.

Source building IDs remain the original OSM feature IDs such as `way/...` and `relation/...`. Each optional entry in `buildingOverrides` may contain `name`, `heightMeters`, `facadeColor`, `roofColor`, `visible`, and a `model` descriptor. Model `assetId` values resolve through `public/models/catalog.json`; absent assignments or missing/broken GLBs render the automatic GeoJSON model without changing building identity or Marmara unit information. Model rotation is stored in radians (XYZ), scale must be positive, and offset is in local scene meters.

For manual registration (optional), place its `.glb` file under `public/models/` and add `{ "id": "stable-id", "name": "Display name", "file": "buildings/file.glb" }` to the catalog. The editor offers catalog assets both in the selected source building's model controls and in the independent GLB placement palette. Independent instances use the existing `objects` records with `objectType: "glb-model"`, `variant` set to the asset ID, and a custom `properties.name`; each instance gets its own UUID and transform. Duplicate instances use Drei's `useGLTF` URL cache and cloned scene roots that share loaded geometry/material references.

See [BLENDER_MODELING.md](BLENDER_MODELING.md) for the Blender-to-GLB modeling and alignment standard.

Run the automated data/model tests with `npm test`.

### Camera and object controls

- **Object mode** is the default. Click a placed object to select it and use its gizmo to move, rotate, or scale it. A gizmo drag is one undo step. Plain left-drag does not move the camera; hold **Option** while left-dragging to rotate the camera.
- **Camera mode** rotates the camera with left-drag. Objects remain selectable, but their transform gizmo is hidden and they cannot be changed by dragging.
- In either edit mode, right-drag pans the camera. Scroll-wheel and trackpad scrolling/pinching continue to zoom. During ground placement, click to place; Option + left-drag remains available for camera rotation.
- Option state is read from keyboard and pointer events and cleared when the window loses focus or the page is hidden.
- The selected-object panel shows live X/Y/Z position in meters, rotation in degrees, and scale. Enter or leaving a numeric field commits the value; each committed field change is one undo step. Y cannot go below zero and scale must be at least `0.05`.
- Placement stays active after each click so the same object type can be placed repeatedly; press **Escape** to close the active placement tool. The editor shortcuts are **1–4** (catalog object types), **D** (duplicate the selected object), **Z** (undo), **Y** (redo), and **Backspace** (delete the selected object). They work only while the editor is focused and edit mode is active, and are ignored in text/numeric fields or while Cmd, Ctrl, Option, or Shift is held.
- Numeric position, rotation, and scale values are shown with two decimal places.

Transform gizmo note: ground and walkway meshes have no pointer handlers during normal editing; the placement surface receives clicks only while placement is armed. Drei's TransformControls raycasts its own handles and draws them without depth testing. The editor therefore preserves selection when a gizmo drag is not a hit in React Three Fiber's separate pointer-event graph, which prevents a floor-level drag from detaching the control.

Manual interaction checklist — mouse:

1. In Object mode, select an object and drag its move, rotate, and scale handles; verify the camera remains still and one undo restores the pre-drag transform.
2. In Object mode, drag empty space with the left button; verify the camera stays still. Hold Option + left-drag; verify the camera rotates. Release Option and repeat; verify it stops rotating.
3. Right-drag to pan in Object and Camera modes.
4. Switch to Camera mode; left-drag to rotate, click an object to select it, and drag over its former gizmo location; verify the object does not change.
5. Switch modes after a completed drag and while moving the pointer over the scene; verify no jump or stale gesture. Move the app out of focus while Option is held, return, and confirm plain left-drag in Object mode no longer rotates the camera.
6. Arm placement in Object mode; click inside the campus to place and verify it lands on the ground. Option + left-drag should rotate without placing an object.

Manual interaction checklist — Mac trackpad:

1. In both edit control modes, scroll with two fingers and pinch to zoom in and out.
2. In Object mode, use Option + one-finger drag to rotate the camera; plain one-finger drag must not move it.
3. Use the trackpad's secondary-click drag to pan in both edit control modes.

Direct object dragging uses one shared renderer interaction for every catalog type. It updates the rendered group only after a 4 px movement threshold, then commits the final X/Z position through the scene store once on pointer release. Pointer cancellation restores the starting pose; window blur commits the last valid pose. Camera mode, Option gestures, placement mode, and TransformControls keep their separate input paths.

Sources, attribution, and licensing notes are documented in [DATA_SOURCES.md](DATA_SOURCES.md). The geometry and height data are not survey-grade. Fifty current heights are placeholders; the remaining eight are inferred from OpenStreetMap floor counts.

## Next stage

1. Confirm the visual scale and footprint placement with a campus-wide scene review.
2. Improve building heights and roofs using verified plans or measurements; keep provenance with each value.
3. Add reviewed GLB files to the catalog and verify building/object models against their Blender origins.
4. Add first-person walking mode and collision handling after the editable model is stable.

The building model is intentionally a massing prototype. It does not yet include detailed facades, editable building footprint vertices, or first-person walking controls.

## Local GLB library import

Start the development server and open **Maket düzenle → Model İçe Aktar**. Drop one `.glb` from Finder or use the file chooser. The panel validates the file, shows its editable library name and approximate X/Y/Z bounds in meters, and reports a model base away from Y=0. Click **Kütüphaneye kaydet**. The palette and source-building model selector refresh without a page reload. Existing placements and assignments keep their IDs and transforms.

`server/modelImportPlugin.ts` adds a Vite development-only POST endpoint at `/__dev/models/import`. It forces the development server to bind to `127.0.0.1` (including when `--host` is supplied). Socket address, Host, same Origin, fetch-site and a custom header are checked; forwarded/remote/cross-origin requests are rejected. It has no preview hook and is excluded from the production application. Production can display the already-built catalog and models, but cannot import files.

- Maximum file size: **50 MiB**. A 30-second stalled-request timeout and streamed size checks apply.
- `src/data/glbImport.ts` checks the GLB 2.0 header, total length, aligned JSON/BIN chunks, embedded buffers, view/accessor bounds, mesh references and node hierarchy. Approximate dimensions use mesh accessor bounds with node transforms; they are not survey measurements or animated/deformed bounds. The browser additionally parses with GLTFLoader before enabling save.
- This first importer accepts self-contained GLBs with embedded PNG/JPEG/WebP images. External/data URIs, sparse accessors, and Draco/Meshopt/KTX2 compression are rejected explicitly. Export a standard, uncompressed Blender GLB with embedded textures. This is a structural safety gate, not a complete Khronos conformance validator.
- Each import receives a new `model-<UUID>` ID and exclusive `public/models/imported/model-<UUID>.glb` filename. Duplicate original names remain independent assets. Files persist across server restarts. Original filenames are never used as server filesystem paths.
- Catalog updates revalidate the existing catalog under an exclusive lock and replace it atomically. Invalid existing entries are reported without being discarded. Symlinked storage paths are rejected. Failed writes roll back only the new upload. If the process is forcibly terminated, an orphan upload or `.catalog-import.lock` can remain; stop all development servers and inspect it before removing a stale lock. Existing catalog entries are retained.
- Scene JSON continues to store only model IDs and transforms using the unchanged version 2 document. **Back up `public/models/` together with exported scene JSON**; JSON does not include the model binaries. Undo/redo applies to scene placement/assignment, not deleting imported library files.

Catalog error diagnosis for this update: `catalog.json` was empty and valid when inspected; the reported `models[0]` entry was not present, so its exact original content could not be recovered. That combined validation error means extra entry fields, an absent/unsafe `id`, and an absent/non-GLB relative `file`. The required shape remains `{ "id": "binadeneme", "name": "Bina Deneme", "file": "binadeneme.glb" }`. The existing Blender file was validated and registered without modifying its bytes.

### Import verification

Automated tests use generated GLB fixtures and temporary project directories, never user scene storage. They cover malformed data, external references, paths, symlinks, remote requests, duplicate filenames, retained catalog records, a fresh server after upload, GLTFLoader parsing, and shared asset IDs in building/placed-object records.

Manual review: import a GLB, place two copies, attach it to a source building, undo/redo the assignment, export/reimport the scene, then restart the dev server and reopen the library. Confirm materials and textures against Blender. In `npm run preview`, verify that the import area is absent; only the published library is available.

Verification on 14 October 2026: 34 automated tests passed; the production build completed; data validation found 58 buildings and 161 clipped walkway surfaces; `git diff --check` passed. A browser import into an isolated project copy updated the palette and building selector without reloading. The imported GLB was served at its catalog URL. The production preview returned 404 for the upload endpoint and omitted the import controls. Full mouse placement and Blender material appearance remain part of the manual visual review.
