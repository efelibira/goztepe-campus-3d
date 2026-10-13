import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createEmptySceneDocument,
  createSceneObject,
  parseSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
} from '../src/editor/sceneDocument.js'
import { OBJECT_TYPE_CATALOG } from '../src/editor/objectCatalog.js'
import { createSceneObjectStore } from '../src/editor/sceneStore.js'

const tree = (id = 'tree-1') => ({
  id,
  objectType: 'tree',
  variant: 'round-canopy',
  transform: { position: [2, 0, 3], rotation: [0, 0.2, 0], scale: [1, 1, 1] },
  properties: { height: 6, color: '#A8B99A' },
})

test('scene document validates and JSON import/export preserves objects', () => {
  const document = { version: 1, objects: [tree()] }
  assert.deepEqual(validateSceneDocument(document), { valid: true, errors: [] })
  assert.deepEqual(parseSceneDocument(serializeSceneDocument(document)), document)
})

test('invalid versions, duplicate IDs, and malformed transforms are rejected', () => {
  assert.equal(validateSceneDocument({ version: 9, objects: [] }).valid, false)
  assert.equal(validateSceneDocument({ version: 1, objects: [tree(), tree()] }).valid, false)
  assert.equal(validateSceneDocument({ version: 1, objects: [{ ...tree(), transform: { ...tree().transform, scale: [1, 0, 1] } }] }).valid, false)
  assert.equal(validateSceneDocument({ version: 1, objects: [{ ...tree(), transform: { ...tree().transform, position: Array(3) } }] }).valid, false)
  assert.throws(() => parseSceneDocument('{broken'), /JSON'u okunamadı/)
  assert.equal(validateSceneDocument({ version: 1, objects: [], extra: true }).valid, false)
})

test('the checked-in JSON Schema documents the runtime document version and object fields', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../public/schemas/scene-document.v1.schema.json', import.meta.url), 'utf8'))
  assert.equal(schema.properties.version.const, 1)
  assert.deepEqual(schema.properties.objects.items.$ref, '#/$defs/sceneObject')
  assert.deepEqual(schema.$defs.sceneObject.required, ['id', 'objectType', 'variant', 'transform', 'properties'])
})

test('unknown object types remain valid for future library extensions', () => {
  const futureObject = { ...tree(), objectType: 'future-pergola', variant: 'glb-v1' }
  assert.equal(validateSceneDocument({ version: 1, objects: [futureObject] }).valid, true)
  assert.deepEqual(parseSceneDocument(serializeSceneDocument({ version: 1, objects: [futureObject] })).objects[0], futureObject)
})

test('store adds, updates, removes, undoes, and redoes scene object changes', () => {
  const store = createSceneObjectStore()
  const id = store.addObject({ ...tree(), id: undefined })
  assert.equal(store.getSnapshot().document.objects.length, 1)
  store.updateObject(id, { transform: { position: [8, 0, 9] }, properties: { height: 8 } })
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [8, 0, 9])
  assert.equal(store.undo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [2, 0, 3])
  assert.equal(store.redo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].properties.height, 8)
  assert.equal(store.removeObject(id), true)
  assert.equal(store.getSnapshot().document.objects.length, 0)
  assert.equal(store.undo(), true)
  assert.equal(store.getSnapshot().document.objects.length, 1)
  assert.throws(() => store.updateObject(id, { transform: { scale: [0, 1, 1] } }), /geçersiz/)
  assert.equal(store.getSnapshot().document.objects.length, 1)
  assert.throws(() => store.importJson('{bad json}'))
  assert.equal(store.getSnapshot().document.objects.length, 1)
})

test('object identity is immutable and published snapshots cannot be mutated by callers', () => {
  const store = createSceneObjectStore()
  const id = store.addObject(tree())
  store.updateObject(id, { id: 'attempted-rekey', properties: { height: 7 } })
  assert.equal(store.getSnapshot().document.objects[0].id, id)
  assert.throws(() => store.getSnapshot().document.objects.push(tree('external')), TypeError)
})

test('a transform drag transaction creates one undo step for many pointer updates', () => {
  const store = createSceneObjectStore()
  const id = store.addObject(tree())
  assert.equal(store.beginTransaction(), true)
  for (let x = 1; x <= 20; x++) store.updateObject(id, { transform: { position: [x, 0, x + 1] } })
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [20, 0, 21])
  assert.equal(store.endTransaction(), true)
  assert.equal(store.getSnapshot().canUndo, true)
  assert.equal(store.undo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [2, 0, 3])
  assert.equal(store.undo(), true)
  assert.equal(store.getSnapshot().document.objects.length, 0)
  assert.equal(store.redo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [2, 0, 3])
})

test('local storage auto-saves and rehydrates; malformed saved JSON falls back safely', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const store = createSceneObjectStore({ storage })
  const id = store.addObject(tree())
  assert.equal(values.size, 1)
  assert.equal(createSceneObjectStore({ storage }).getSnapshot().document.objects[0].id, id)

  values.set('goztepe-campus-3d:scene:v1', '{broken')
  const recovered = createSceneObjectStore({ storage })
  assert.equal(recovered.getSnapshot().document.objects.length, 0)
  assert.match(recovered.getSnapshot().persistenceError, /boş sahne kullanılacak/)
})

test('the starter object library defines four independent procedural model types', () => {
  assert.deepEqual(Object.keys(OBJECT_TYPE_CATALOG).sort(), ['bench', 'gazebo', 'rectangular-building', 'tree'])
  for (const definition of Object.values(OBJECT_TYPE_CATALOG)) {
    assert.equal(definition.renderer, 'procedural')
    assert.ok(definition.variants.includes(definition.defaultVariant))
    assert.ok(Object.keys(definition.defaultProperties).length > 0)
  }
  assert.deepEqual(createEmptySceneDocument(), { version: 1, objects: [] })
  const defaultTree = createSceneObject('tree', { id: 'tree-default' })
  assert.equal(defaultTree.id, 'tree-default')
  assert.equal(defaultTree.variant, 'round-canopy')
  assert.equal(defaultTree.properties.height, 6)
  assert.throws(() => createSceneObject('tree', { variant: 'missing' }), /tanımlı değil/)
})

test('storage errors are recoverable and cannot prevent in-memory editing', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota') } }
  const store = createSceneObjectStore({ storage })
  assert.doesNotThrow(() => store.addObject(tree()))
  assert.match(store.getSnapshot().persistenceError, /otomatik kaydedilemedi/)
})
