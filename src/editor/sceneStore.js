import {
  assertValidSceneDocument,
  createEmptySceneDocument,
  createObjectId,
  parseSceneDocument,
  SCENE_STORAGE_KEY,
  serializeSceneDocument,
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
  let document = immutableJsonCopy(assertValidSceneDocument(initialDocument ?? createEmptySceneDocument()))
  let persistenceError = null
  const past = [], future = [], listeners = new Set()
  let transactionBase = null

  if (storage) {
    try {
      const saved = storage.getItem(storageKey)
      if (saved !== null) document = immutableJsonCopy(parseSceneDocument(saved))
    } catch (error) {
      persistenceError = `Kaydedilmiş sahne yüklenemedi; boş sahne kullanılacak. ${error instanceof Error ? error.message : ''}`.trim()
    }
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
