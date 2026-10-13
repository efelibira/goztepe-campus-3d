export const OBJECT_TYPE_CATALOG = Object.freeze({
  'rectangular-building': Object.freeze({
    label: 'Basit bina', renderer: 'procedural', defaultVariant: 'pastel-block',
    variants: Object.freeze(['pastel-block']),
    defaultProperties: Object.freeze({ width: 12, depth: 9, height: 5, color: '#98A1BC' }),
  }),
  tree: Object.freeze({
    label: 'Ağaç', renderer: 'procedural', defaultVariant: 'round-canopy',
    variants: Object.freeze(['round-canopy']),
    defaultProperties: Object.freeze({ height: 6, canopyRadius: 1.8, trunkRadius: 0.22, color: '#A8B99A' }),
  }),
  bench: Object.freeze({
    label: 'Bank', renderer: 'procedural', defaultVariant: 'wood-slats',
    variants: Object.freeze(['wood-slats']),
    defaultProperties: Object.freeze({ length: 1.8, color: '#B99B7A' }),
  }),
  gazebo: Object.freeze({
    label: 'Çardak', renderer: 'procedural', defaultVariant: 'open-square',
    variants: Object.freeze(['open-square']),
    defaultProperties: Object.freeze({ width: 4, depth: 4, height: 3.2, color: '#D6C4A8' }),
  }),
})

export function getObjectTypeDefinition(objectType) {
  return OBJECT_TYPE_CATALOG[objectType] ?? null
}
