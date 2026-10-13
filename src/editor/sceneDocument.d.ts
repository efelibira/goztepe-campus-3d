export type Vector3Tuple = [number, number, number]
export type SceneObjectTransform = { position: Vector3Tuple; rotation: Vector3Tuple; scale: Vector3Tuple }
export type SceneObjectRecord = {
  id: string
  objectType: string
  variant: string
  transform: SceneObjectTransform
  properties: Record<string, unknown>
}
export type BuildingGlbModelOverride = {
  type: 'glb'
  assetId: string
  scale: Vector3Tuple
  rotation: Vector3Tuple
  offset: Vector3Tuple
}
export type BuildingEditOverride = {
  name?: string
  heightMeters?: number
  facadeColor?: string
  roofColor?: string
  visible?: boolean
  model?: BuildingGlbModelOverride
}
export type SceneObjectOptions = {
  id?: string
  variant?: string
  transform?: Partial<SceneObjectTransform>
  properties?: Record<string, unknown>
}
export type SceneDocument = { version: 2; objects: SceneObjectRecord[]; buildingOverrides: Record<string, BuildingEditOverride> }
export const SCENE_DOCUMENT_VERSION: 2
export const SCENE_STORAGE_KEY: string
export const LEGACY_SCENE_STORAGE_KEY: string
export function createEmptySceneDocument(): SceneDocument
export function validateSceneDocument(value: unknown): { valid: boolean; errors: string[] }
export function assertValidSceneDocument(value: unknown): SceneDocument
export function upgradeSceneDocument(value: unknown): SceneDocument
export function parseSceneDocument(text: string): SceneDocument
export function serializeSceneDocument(document: SceneDocument): string
export function createObjectId(): string
export function createSceneObject(objectType: string, options?: SceneObjectOptions): SceneObjectRecord
