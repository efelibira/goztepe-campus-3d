# AI handoff — Göztepe Campus 3D

This file records the project state for a developer or another AI assistant. Read `AGENTS.md`, `README.md`, and `BLENDER_MODELING.md` before changing geometry or editor behavior.

## Scope and invariants

- This is the independent `goztepe-campus-3d` app. The separate `goztepe-campus-map` 2D repository is a reference and must not be changed as part of this project.
- The scene has 58 source buildings and 161 clipped walkway surfaces. Source GeoJSON stays immutable. Building identity is the original OSM feature ID.
- User-placed items and source-building edits remain separate in scene document version 2: `objects` and `buildingOverrides`. Version 1 scene records still migrate on import. Scene JSON and localStorage never contain GLB binaries or filesystem paths.
- Keep camera orientation, projection, controls, direct drag, TransformControls, selection, and one-transaction undo behavior intact.

## Current GLB architecture

| Concern | File and contract |
| --- | --- |
| Catalog | `public/models/catalog.json`, version 1; each entry has exactly `id`, `name`, and a safe `file` path relative to `public/models/`. |
| Catalog validation and resolution | `src/data/modelCatalog.ts`; maps IDs to `/models/...` URLs for both the object palette and source-building selector. |
| Existing sample | `public/models/binadeneme.glb` is registered as `binadeneme`. Its bytes are retained; its Blender origin puts its base around local Y = −3.22 m, so use model offset or correct the Blender origin before final placement. |
| Imported binaries | `public/models/imported/model-<UUID>.glb`, created by the development-only Vite middleware. IDs stay stable once used in scene records. |
| GLB structural gate | `src/data/glbImport.ts`; header/chunk, embedded data, accessor, hierarchy, size and approximate bounds checks. The browser also tries GLTFLoader parsing. |
| Local write API | `server/modelImportPlugin.ts` and `vite.config.ts`; POST `/__dev/models/import`. It binds to 127.0.0.1, verifies loopback socket/Host/Origin/custom header, caps uploads at 50 MiB, rejects symlinked storage paths, and atomically appends catalog entries under a lock. It has no production preview hook. |
| Import UI | `src/components/ModelImportPanel.tsx`, visible in editor mode only in Vite development. Successful imports reload catalog state in `src/App.tsx` so both selectors update without a page reload. |
| Source-building assignment | `src/components/BuildingEditPanel.tsx` writes a `buildingOverrides[id].model` descriptor; `src/components/BuildingMesh.tsx` uses the GLB when available and falls back to GeoJSON massing on a missing or failed asset. |
| Independent placement | `objectType: "glb-model"`, `variant: <catalog ID>`, unique object UUID, `properties.name`; `PlacedObjectsLayer.tsx` renders it with the common edit/drag behavior. Drei URL cache and scene cloning reuse geometry/material resources. |

The original reported `models[0]` schema error could not be reproduced from the inspected catalog: that file was valid and empty at inspection time. The earlier invalid row was not available, so it was not silently discarded or reconstructed. The existing `binadeneme.glb` was validated and added as a valid record.

## Import and backup workflow

Run `npm run dev`; in edit mode use **Model İçe Aktar** to drop or choose one `.glb`. Review the displayed name and approximate X/Y/Z dimensions, then save. The new model becomes available in the palette and the building model selector immediately. Multiple copies use the same catalog ID. Models persist under `public/models/imported/` after a server restart.

Back up `public/models/` together with any exported scene JSON. The JSON only records asset IDs; without the referenced catalog and GLB files, source buildings fall back to GeoJSON and independent objects use their missing-model marker. A forced crash can leave an orphan GLB or `.catalog-import.lock`; inspect and reconcile these manually with all development servers stopped. Do not automatically delete existing catalog entries or user models.

## Verification state

On 14 October 2026: `npm test` passed 34/34; `npm run build` passed; `npm run validate:data` confirmed 58 buildings and 161 clipped walkway surfaces; `git diff --check` passed. Tests use generated GLBs and temporary project directories. They cover valid and malformed files, duplicate upload names, directory traversal, symlinks, localhost restrictions, catalog preservation, restart persistence, GLTFLoader parse, shared catalog IDs, source-building assignment, and scene undo/redo. A separate browser project copy accepted an import, refreshed the palette and source-building selector without reload, and served the imported GLB with HTTP 200. The production preview upload route returned HTTP 404 and showed no import controls.

The automated parse test proves that the generated GLB is loadable; it does not assess appearance, textured materials, or every pointer interaction. Review those visually with real Blender exports and the manual checklist in `README.md` before further model work.
