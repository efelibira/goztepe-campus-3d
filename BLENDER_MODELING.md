# Blender to GLB modeling standard

This guide defines the asset contract for optional detailed models assigned to source buildings. The automatic GeoJSON extrusion remains the default and fallback model.

## Units and axes

- Use meters in Blender. One Three.js scene unit equals one meter.
- Use **Y up**. The building rises along local `+Y`; the ground plane is local `X/Z`.
- Apply object transforms before export when practical. Export GLB with glTF's standard axis conversion enabled; do not add a compensating global rotation in the app.
- Keep scale positive. Asset assignment scale is a positive `[x, y, z]` multiplier. The saved XYZ rotation is in radians; the UI/asset pipeline should make degrees explicit when presenting it to people.

## Origin and alignment

- Set the Blender model origin at the ground-level center of the source building footprint's projected bounding box.
- Put the model base on local `Y = 0`; do not center the origin vertically.
- Local `X` aligns with projected east and local **`-Z`** points north. The existing projection maps north to scene `-Z`; model local `+Z` therefore points south. The application places the model at the footprint center and does not change the camera or geographic projection.
- Do not edit the campus coordinate projection or camera orientation to align an asset. Correct the Blender origin/orientation or use that building's model `rotation`/`offset` override.
- Offsets are small local scene-meter adjustments from the footprint-center ground origin, saved per stable OSM building ID.

The persisted assignment shape is:

```json
{
  "model": {
    "type": "glb",
    "assetId": "fen-edebiyat-model",
    "scale": [1, 1, 1],
    "rotation": [0, 0, 0],
    "offset": [0, 0, 0]
  }
}
```

Assets are resolved by stable ID through `public/models/catalog.json`; its file path is relative to `public/models/` and can point into `buildings/` or `objects/`. The building identity, name, Marmara unit information, and source footprint stay in their existing source records. An absent catalog assignment or unavailable GLB renders the automatic GeoJSON building instead. The same catalog ID can be assigned to multiple buildings or placed as multiple independent scene objects.

## Materials and textures

- Use glTF-compatible Principled BSDF materials and bake/pack dependencies into the exported GLB.
- Embed image textures in the GLB. Avoid external absolute paths or sidecar textures so assets work when copied to another deployment.
- Prefer base color, normal, and ORM maps only when they materially improve the stylized model. Preserve sensible roughness; avoid relying on Blender-only procedural nodes that glTF cannot export.
- Keep texture color space correct: base color/emission are sRGB; normal, roughness, metallic, and occlusion data are non-color.

## Suggested budgets

These are starting recommendations, not measured limits. Optimize the full campus together and check visual quality on the target browser/device.

- Typical campus building: about 10k–30k triangles; small utility building: about 2k–10k triangles.
- Prefer one or a few material slots per building. Avoid tiny disconnected details that cannot be seen at the default campus camera distance.
- 1K–2K textures are usually sufficient. Reserve 4K textures for a justified close-up hero asset; use lower resolution or no texture for distant surfaces.
- Reuse materials and texture atlases where it makes sense, and remove hidden/internal faces before export.

## Before adding an asset

Check the model against its source footprint and neighboring buildings, verify its ground contact and north orientation, and review its triangle/texture sizes. Keep the automatic model available until the GLB is confirmed in the app. The application supports catalog registration, building assignment, and independent placement with a graceful fallback; local development supports file chooser / Finder drop imports through **Model İçe Aktar**. It does not include texture editing. Export a self-contained, uncompressed GLB (no Draco/Meshopt/KTX2, external files/data URIs or sparse accessors for this first importer), with embedded PNG/JPEG/WebP textures and a maximum file size of 50 MiB.
