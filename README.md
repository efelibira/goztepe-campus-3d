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
npm test
```

## Prototype features

- Converts the 58 campus building footprints from WGS84 coordinates into local meter-based X/Z coordinates.
- Converts Polygon and MultiPolygon rings into Three.js Shapes, preserving interior rings as holes, then extrudes each footprint into a building mass.
- Provides a simple campus ground, soft lighting, shadows, and damped OrbitControls.
- Clicking a building highlights it and displays its resolved name, linked Marmara units, OSM ID, and height-confidence label.
- Keeps future presentation-only building edits separate in `public/data/building-visual-overrides.json`.
- Keeps placed scene objects in a versioned document separate from campus GeoJSON and building records.
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
- `public/schemas/scene-document.v1.schema.json`: version 1 JSON Schema for user-placed scene objects.

## Scene object editing foundation

The existing buildings remain source features resolved from GeoJSON. User-created objects are stored separately in a `SceneDocument` and rendered by `PlacedObjectsLayer`; source features are never edited by the object store.

Each placed object has a persistent unique `id`, `objectType`, `variant`, a transform (`position`, `rotation`, and positive `scale` vectors), and a `properties` record for model-specific settings. The starter library defines `rectangular-building`, `tree`, `bench`, and `gazebo`. Their procedural React Three Fiber model components are independent of saved object records. The renderer registry supports procedural components and lazy-loaded GLB assets, so a variant can switch renderers without changing saved scene records.

The versioned document currently has this shape:

```json
{
  "version": 1,
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
  ]
}
```

The complete machine-readable schema is [scene-document.v1.schema.json](public/schemas/scene-document.v1.schema.json). Runtime validation rejects unsupported versions, duplicate IDs, malformed transforms, and invalid properties before data enters the store. `parseSceneDocument` and `serializeSceneDocument` provide JSON import/export primitives. The store persists successful changes under `goztepe-campus-3d:scene:v1` in localStorage; unreadable saved JSON falls back to an empty document and reports a recoverable warning in the store snapshot. A failed JSON import leaves the current scene intact.

Run the automated data/model tests with `npm test`.

### Camera and object controls

- **Object mode** is the default. Click a placed object to select it and use its gizmo to move, rotate, or scale it. A gizmo drag is one undo step. Plain left-drag does not move the camera; hold **Option** while left-dragging to rotate the camera.
- **Camera mode** rotates the camera with left-drag. Objects remain selectable, but their transform gizmo is hidden and they cannot be changed by dragging.
- In either edit mode, right-drag pans the camera. Scroll-wheel and trackpad scrolling/pinching continue to zoom. During ground placement, click to place; Option + left-drag remains available for camera rotation.
- Option state is read from keyboard and pointer events and cleared when the window loses focus or the page is hidden.
- The selected-object panel shows live X/Y/Z position in meters, rotation in degrees, and scale. Enter or leaving a numeric field commits the value; each committed field change is one undo step. Y cannot go below zero and scale must be at least `0.05`.

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
3. Add object property editing, placement snapping, duplication, and clearer selection feedback.
4. Add reviewed GLB assets, then first-person walking mode and collision handling after the editable model is stable.

The building model is intentionally a massing prototype. It does not yet include detailed facades, editable building footprint vertices, or first-person walking controls.
