import {
  assertValidSceneDocument,
  createEmptySceneDocument,
  createObjectId,
  LEGACY_SCENE_STORAGE_KEY,
  parseSceneDocument,
  SCENE_STORAGE_KEY,
  serializeSceneDocument,
  upgradeSceneDocument,
} from './sceneDocument.js'

const HISTORY_LIMIT = 100

function immutableJsonCopy(value) {
  const copy = JSON.parse(JSON.stringify(value))
  const freeze = (item) => {
    if (item && typeof item === 'object' && !Object.isFrozen(item)) {
      Object.values(item).forEach(freeze)
      Object.freeze(item)
    }
    return item
  }
  return freeze(copy)
}

/** Small external store; UI frameworks subscribe without owning scene data. */
export function createSceneObjectStore({ storage, storageKey = SCENE_STORAGE_KEY, initialDocument, historyLimit = HISTORY_LIMIT } = {}) {
  let document = immutableJsonCopy(upgradeSceneDocument(assertValidSceneDocument(initialDocument ?? createEmptySceneDocument())))
  let persistenceError = null
  const past = [], future = [], listeners = new Set()
  let transactionBase = null

  if (storage) {
    let loadError = null
    const storageKeys = storageKey === SCENE_STORAGE_KEY ? [storageKey, LEGACY_SCENE_STORAGE_KEY] : [storageKey]
    for (const key of storageKeys) {
      try {
        const saved = storage.getItem(key)
        if (saved === null) continue
        document = immutableJsonCopy(parseSceneDocument(saved))
        if (loadError) persistenceError = `Yeni kayıt okunamadı; eski kayıt yüklendi. ${loadError}`
        break
      } catch (error) {
        loadError = error instanceof Error ? error.message : 'geçersiz kayıt'
      }
    }
    if (loadError && !persistenceError) persistenceError = `Kaydedilmiş sahne yüklenemedi; boş sahne kullanılacak. ${loadError}`
  }

  let snapshot
  const publish = () => {
    snapshot = { document, canUndo: past.length > 0, canRedo: future.length > 0, persistenceError }
    for (const listener of listeners) listener()
  }
  const persist = () => {
    if (!storage) return
    try { storage.setItem(storageKey, serializeSceneDocument(document)); persistenceError = null }
    catch (error) { persistenceError = `Sahne otomatik kaydedilemedi. ${error instanceof Error ? error.message : ''}`.trim() }
  }
  const commit = (next) => {
    assertValidSceneDocument(next)
    if (transactionBase === null) {
      past.push(document)
      if (past.length > historyLimit) past.shift()
      future.length = 0
    }
    document = immutableJsonCopy(next)
    if (transactionBase === null) persist()
    publish()
  }

  const finishTransaction = (cancel = false) => {
    if (transactionBase === null) return false
    const start = transactionBase
    transactionBase = null
    if (cancel) document = start
    else if (document !== start) {
      past.push(start)
      if (past.length > historyLimit) past.shift()
      future.length = 0
    }
    persist()
    publish()
    return true
  }

  publish()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    beginTransaction() {
      if (transactionBase !== null) return false
      transactionBase = document
      return true
    },
    endTransaction() { return finishTransaction() },
    cancelTransaction() { return finishTransaction(true) },
    addObject(input) {
      const object = { ...input, id: input.id ?? createObjectId() }
      const next = { ...document, objects: [...document.objects, object] }
      commit(next)
      return object.id
    },
    updateObject(id, patch) {
      const index = document.objects.findIndex((object) => object.id === id)
      if (index < 0) throw new Error(`Sahne nesnesi bulunamadı: ${id}`)
      const current = document.objects[index]
      const updated = {
        ...current,
        ...patch,
        id: current.id,
        transform: patch.transform ? { ...current.transform, ...patch.transform } : current.transform,
        properties: patch.properties ? { ...current.properties, ...patch.properties } : current.properties,
      }
      const objects = [...document.objects]
      objects[index] = updated
      commit({ ...document, objects })
    },
    updateBuildingOverride(id, patch) {
      if (typeof id !== 'string' || !id.trim()) throw new Error('Bina kimliği boş olamaz.')
      const current = document.buildingOverrides[id] ?? {}
      const updated = { ...current }
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) delete updated[key]
        else updated[key] = value
      }
      if (JSON.stringify(current) === JSON.stringify(updated)) return
      const buildingOverrides = { ...document.buildingOverrides }
      if (Object.keys(updated).length) buildingOverrides[id] = updated
      else delete buildingOverrides[id]
      commit({ ...document, buildingOverrides })
    },
    resetBuildingOverride(id, field) {
      const current = document.buildingOverrides[id]
      if (!current || !Object.hasOwn(current, field)) return
      const updated = { ...current }
      delete updated[field]
      const buildingOverrides = { ...document.buildingOverrides }
      if (Object.keys(updated).length) buildingOverrides[id] = updated
      else delete buildingOverrides[id]
      commit({ ...document, buildingOverrides })
    },
    removeObject(id) {
      if (!document.objects.some((object) => object.id === id)) return false
      commit({ ...document, objects: document.objects.filter((object) => object.id !== id) })
      return true
    },
    undo() {
      if (transactionBase !== null) finishTransaction()
      if (!past.length) return false
      future.push(document)
      document = past.pop()
      persist(); publish()
      return true
    },
    redo() {
      if (transactionBase !== null) finishTransaction()
      if (!future.length) return false
      past.push(document)
      document = future.pop()
      persist(); publish()
      return true
    },
    importJson(text) {
      if (transactionBase !== null) finishTransaction()
      commit(parseSceneDocument(text))
    },
    exportJson() { return serializeSceneDocument(document) },
  }
}
