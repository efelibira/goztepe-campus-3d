import type { BuildingEditOverride, SceneDocument, SceneObjectRecord } from './sceneDocument'
export type SceneStoreSnapshot = {
  document: SceneDocument
  canUndo: boolean
  canRedo: boolean
  persistenceError: string | null
}
export type SceneObjectPatch = Partial<Omit<SceneObjectRecord, 'id' | 'transform' | 'properties'>> & {
  transform?: Partial<SceneObjectRecord['transform']>
  properties?: Record<string, unknown>
}
export type SceneObjectStore = {
  getSnapshot: () => SceneStoreSnapshot
  subscribe: (listener: () => void) => () => void
  beginTransaction: () => boolean
  endTransaction: () => boolean
  cancelTransaction: () => boolean
  addObject: (object: Omit<SceneObjectRecord, 'id'> & { id?: string }) => string
  updateObject: (id: string, patch: SceneObjectPatch) => void
  updateBuildingOverride: (id: string, patch: Partial<BuildingEditOverride>) => void
  resetBuildingOverride: (id: string, field: keyof BuildingEditOverride) => void
  removeObject: (id: string) => boolean
  undo: () => boolean
  redo: () => boolean
  importJson: (text: string) => void
  exportJson: () => string
}
export function createSceneObjectStore(options?: {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  storageKey?: string
  initialDocument?: SceneDocument
  historyLimit?: number
}): SceneObjectStore
