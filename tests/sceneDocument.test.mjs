import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  createEmptySceneDocument,
  createSceneObject,
  LEGACY_SCENE_STORAGE_KEY,
  parseSceneDocument,
  SCENE_STORAGE_KEY,
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
  const document = { version: 2, objects: [tree()], buildingOverrides: {} }
  assert.deepEqual(validateSceneDocument(document), { valid: true, errors: [] })
  assert.deepEqual(parseSceneDocument(serializeSceneDocument(document)), document)
})

test('version 1 records upgrade without losing objects and start with separate building overrides', () => {
  const legacy = { version: 1, objects: [tree()] }
  const upgraded = parseSceneDocument(JSON.stringify(legacy))
  assert.deepEqual(upgraded, { version: 2, objects: [tree()], buildingOverrides: {} })
})

test('building edits and GLB assignments are validated independently of placed objects', () => {
  const document = {
    version: 2,
    objects: [tree()],
    buildingOverrides: {
      'way/123': {
        name: 'Fen-Edebiyat Fakültesi', heightMeters: 18, facadeColor: '#98A1BC',
        roofColor: '#DED3C4', visible: false,
        model: { type: 'glb', assetId: 'fen-edebiyat', scale: [1, 1, 1], rotation: [0, 0, 0], offset: [0, 0, 0] },
      },
    },
  }
  assert.equal(validateSceneDocument(document).valid, true)
  assert.deepEqual(parseSceneDocument(serializeSceneDocument(document)), document)
  for (const invalid of [
    { heightMeters: 0 }, { heightMeters: Infinity }, { facadeColor: 'red' },
    { visible: 'false' }, { model: { type: 'glb', assetId: '../unsafe', scale: [1, 1, 1], rotation: [0, 0, 0], offset: [0, 0, 0] } },
    { model: { type: 'glb', assetId: 'building', scale: [1, 0, 1], rotation: [0, 0, 0], offset: [0, 0, 0] } },
  ]) {
    assert.equal(validateSceneDocument({ version: 2, objects: [], buildingOverrides: { 'way/123': invalid } }).valid, false)
  }
})

test('invalid versions, duplicate IDs, and malformed transforms are rejected', () => {
  assert.equal(validateSceneDocument({ version: 9, objects: [] }).valid, false)
  assert.equal(validateSceneDocument({ version: 1, objects: [tree(), tree()] }).valid, false)
  assert.equal(validateSceneDocument({ version: 1, objects: [{ ...tree(), transform: { ...tree().transform, scale: [1, 0, 1] } }] }).valid, false)
  assert.equal(validateSceneDocument({ version: 1, objects: [{ ...tree(), transform: { ...tree().transform, position: Array(3) } }] }).valid, false)
  assert.throws(() => parseSceneDocument('{broken'), /JSON'u okunamadı/)
  assert.equal(validateSceneDocument({ version: 2, objects: [], buildingOverrides: {}, extra: true }).valid, false)
})

test('the checked-in JSON Schema documents the runtime document version and object fields', () => {
  const schema = JSON.parse(fs.readFileSync(new URL('../public/schemas/scene-document.v1.schema.json', import.meta.url), 'utf8'))
  assert.equal(schema.properties.version.const, 1)
  assert.deepEqual(schema.properties.objects.items.$ref, '#/$defs/sceneObject')
  assert.deepEqual(schema.$defs.sceneObject.required, ['id', 'objectType', 'variant', 'transform', 'properties'])
  const currentSchema = JSON.parse(fs.readFileSync(new URL('../public/schemas/scene-document.v2.schema.json', import.meta.url), 'utf8'))
  assert.equal(currentSchema.properties.version.const, 2)
  assert.deepEqual(currentSchema.required, ['version', 'objects', 'buildingOverrides'])
  assert.ok(currentSchema.$defs.buildingOverride.properties.model)
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
  values.delete(SCENE_STORAGE_KEY)
  const recovered = createSceneObjectStore({ storage })
  assert.equal(recovered.getSnapshot().document.objects.length, 0)
  assert.match(recovered.getSnapshot().persistenceError, /boş sahne kullanılacak/)
})

test('the starter object library defines four independent procedural model types', () => {
  assert.deepEqual(Object.keys(OBJECT_TYPE_CATALOG).sort(), ['bench', 'gazebo', 'glb-model', 'rectangular-building', 'tree'])
  for (const definition of Object.values(OBJECT_TYPE_CATALOG).filter((item) => item.renderer === 'procedural')) {
    assert.equal(definition.renderer, 'procedural')
    assert.ok(definition.variants.includes(definition.defaultVariant))
    assert.ok(Object.keys(definition.defaultProperties).length > 0)
  }
  assert.equal(OBJECT_TYPE_CATALOG['glb-model'].renderer, 'gltf')
  assert.deepEqual(createEmptySceneDocument(), { version: 2, objects: [], buildingOverrides: {} })
  const defaultTree = createSceneObject('tree', { id: 'tree-default' })
  assert.equal(defaultTree.id, 'tree-default')
  assert.equal(defaultTree.variant, 'round-canopy')
  assert.equal(defaultTree.properties.height, 6)
  assert.throws(() => createSceneObject('tree', { variant: 'missing' }), /tanımlı değil/)
})

test('GLB placements keep UUIDs, a reusable model ID, custom names, transforms, and undo/redo in existing records', () => {
  const store = createSceneObjectStore()
  const createModel = (position) => createSceneObject('glb-model', {
    variant: 'library-building-a',
    transform: { position },
    properties: { name: 'Kuzey giriş modeli' },
  })
  const first = createModel([4, 0, 6])
  const second = createModel([8, 0, 6])
  assert.match(first.id, /^[0-9a-f-]{36}$/i)
  assert.notEqual(first.id, second.id)
  assert.equal(first.variant, second.variant)
  store.addObject(first)
  store.updateObject(first.id, { transform: { position: [10, 0, 12], rotation: [0, 0.5, 0], scale: [1.2, 1.2, 1.2] }, properties: { name: 'Kuzey giriş kopyası' } })
  assert.equal(store.getSnapshot().document.objects[0].properties.name, 'Kuzey giriş kopyası')
  const reloaded = createSceneObjectStore({ storage: { getItem: () => store.exportJson(), setItem: () => {} } })
  assert.deepEqual(reloaded.getSnapshot().document.objects[0].transform, { position: [10, 0, 12], rotation: [0, 0.5, 0], scale: [1.2, 1.2, 1.2] })
  assert.equal(reloaded.getSnapshot().document.objects[0].variant, 'library-building-a')
  assert.equal(store.undo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [4, 0, 6])
  assert.equal(store.redo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [10, 0, 12])
  assert.throws(() => createSceneObject('glb-model', { variant: '../outside' }), /tanımlı değil/)
  assert.equal(validateSceneDocument({ version: 2, objects: [{ ...first, variant: '../outside' }], buildingOverrides: {} }).valid, false)
  assert.equal(validateSceneDocument({ version: 2, objects: [{ ...first, properties: { ...first.properties, assetUrl: '/models/hidden.glb' } }], buildingOverrides: {} }).valid, false)
})

test('building edits autosave, rehydrate, undo, redo, reset, and import/export separately', () => {
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const store = createSceneObjectStore({ storage })
  const buildingModel = { type: 'glb', assetId: 'shared-faculty-model', scale: [1, 1, 1], rotation: [0, 0, 0], offset: [0.25, 0, -0.5] }
  store.updateBuildingOverride('way/123', { name: 'Yeni ad', heightMeters: 21, facadeColor: '#123456', roofColor: '#654321', visible: false, model: buildingModel })
  assert.equal(values.has(SCENE_STORAGE_KEY), true)
  assert.equal(values.has(LEGACY_SCENE_STORAGE_KEY), false)
  assert.deepEqual(createSceneObjectStore({ storage }).getSnapshot().document.buildingOverrides['way/123'], {
    name: 'Yeni ad', heightMeters: 21, facadeColor: '#123456', roofColor: '#654321', visible: false, model: buildingModel,
  })
  assert.equal(store.undo(), true)
  assert.deepEqual(store.getSnapshot().document.buildingOverrides, {})
  assert.equal(store.redo(), true)
  assert.equal(store.getSnapshot().document.buildingOverrides['way/123'].heightMeters, 21)
  store.resetBuildingOverride('way/123', 'heightMeters')
  assert.equal(Object.hasOwn(store.getSnapshot().document.buildingOverrides['way/123'], 'heightMeters'), false)
  const exported = store.exportJson()
  const imported = createSceneObjectStore()
  imported.importJson(exported)
  assert.equal(imported.getSnapshot().document.buildingOverrides['way/123'].name, 'Yeni ad')
  assert.equal(imported.getSnapshot().document.buildingOverrides['way/123'].model.assetId, 'shared-faculty-model')
  assert.equal(imported.getSnapshot().document.buildingOverrides['way/123'].model.file, undefined)
  imported.resetBuildingOverride('way/123', 'model')
  assert.equal(imported.getSnapshot().document.buildingOverrides['way/123'].model, undefined)
  assert.equal(imported.undo(), true)
  assert.equal(imported.getSnapshot().document.buildingOverrides['way/123'].model.assetId, 'shared-faculty-model')
  const before = imported.exportJson()
  assert.throws(() => imported.importJson(JSON.stringify({ version: 2, objects: [], buildingOverrides: { 'way/123': { heightMeters: -4 } } })))
  assert.equal(imported.exportJson(), before)
})

test('legacy v1 localStorage scene is readable and upgrades separately under the v2 storage key', () => {
  const values = new Map([[LEGACY_SCENE_STORAGE_KEY, JSON.stringify({ version: 1, objects: [tree()] })]])
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const store = createSceneObjectStore({ storage })
  assert.equal(store.getSnapshot().document.version, 2)
  assert.deepEqual(store.getSnapshot().document.buildingOverrides, {})
  assert.equal(store.getSnapshot().document.objects[0].id, 'tree-1')
})

test('storage errors are recoverable and cannot prevent in-memory editing', () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota') } }
  const store = createSceneObjectStore({ storage })
  assert.doesNotThrow(() => store.addObject(tree()))
  assert.match(store.getSnapshot().persistenceError, /otomatik kaydedilemedi/)
})
