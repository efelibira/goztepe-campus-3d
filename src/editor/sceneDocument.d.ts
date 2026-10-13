export type Vector3Tuple = [number, number, number]
export type SceneObjectTransform = { position: Vector3Tuple; rotation: Vector3Tuple; scale: Vector3Tuple }
export type SceneObjectRecord = {
  id: string
  objectType: string
  variant: string
  transform: SceneObjectTransform
  properties: Record<string, unknown>
}
export type SceneObjectOptions = {
  id?: string
  variant?: string
  transform?: Partial<SceneObjectTransform>
  properties?: Record<string, unknown>
}
export type SceneDocument = { version: 1; objects: SceneObjectRecord[] }
export const SCENE_DOCUMENT_VERSION: 1
export const SCENE_STORAGE_KEY: string
export function createEmptySceneDocument(): SceneDocument
export function validateSceneDocument(value: unknown): { valid: boolean; errors: string[] }
export function assertValidSceneDocument(value: unknown): SceneDocument
export function parseSceneDocument(text: string): SceneDocument
export function serializeSceneDocument(document: SceneDocument): string
export function createObjectId(): string
export function createSceneObject(objectType: string, options?: SceneObjectOptions): SceneObjectRecord
