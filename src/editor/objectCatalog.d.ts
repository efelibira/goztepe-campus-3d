export type ObjectTypeDefinition = {
  label: string
  renderer: 'procedural' | 'gltf'
  defaultVariant: string
  variants: readonly string[]
  defaultProperties: Readonly<Record<string, string | number>>
}
export const OBJECT_TYPE_CATALOG: Readonly<Record<string, ObjectTypeDefinition>>
export function getObjectTypeDefinition(objectType: string): ObjectTypeDefinition | null
