import test from 'node:test'
import assert from 'node:assert/strict'
import { CAMPUS_ORIGIN } from '../src/data/projectCoordinates.js'
import { createCampusContainment } from '../src/data/campusBoundary.js'
import { hasDirectDragThreshold, positionFromGroundDrag } from '../src/editor/groundPlaneDrag.js'
import { createSceneObject } from '../src/editor/sceneDocument.js'
import { createSceneObjectStore } from '../src/editor/sceneStore.js'

test('direct drag waits for a small movement threshold and preserves the clicked X/Z offset and height', () => {
  assert.equal(hasDirectDragThreshold({ x: 20, y: 20 }, { x: 22, y: 21 }), false)
  assert.equal(hasDirectDragThreshold({ x: 20, y: 20 }, { x: 24, y: 20 }), true)
  assert.deepEqual(positionFromGroundDrag([10, 2.5, -4], { x: 8, z: -7 }, { x: 20, z: 30 }), [22, 2.5, 33])
})

test('campus containment supports polygons, holes, and multipolygons in local X/Z', () => {
  const [longitude, latitude] = CAMPUS_ORIGIN
  const outer = [
    [longitude - 0.001, latitude - 0.001], [longitude + 0.001, latitude - 0.001],
    [longitude + 0.001, latitude + 0.001], [longitude - 0.001, latitude + 0.001],
    [longitude - 0.001, latitude - 0.001],
  ]
  const hole = [
    [longitude - 0.0001, latitude - 0.0001], [longitude + 0.0001, latitude - 0.0001],
    [longitude + 0.0001, latitude + 0.0001], [longitude - 0.0001, latitude + 0.0001],
    [longitude - 0.0001, latitude - 0.0001],
  ]
  const second = outer.map(([x, y]) => [x + 0.004, y])
  const contains = createCampusContainment({ type: 'MultiPolygon', coordinates: [[outer, hole], [second]] })
  assert.equal(contains(0, 0), false)
  assert.equal(contains(30, 0), true)
  assert.equal(contains(400, 0), true)
  assert.equal(contains(600, 0), false)
})

test('a direct drag is one store transaction, undo/redo step, and saved position', () => {
  const memory = new Map()
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
  const store = createSceneObjectStore({ storage })
  const id = store.addObject(createSceneObject('tree'))
  store.beginTransaction()
  // Pointer movement is transient; only the final position enters the store.
  store.updateObject(id, { transform: { position: [12, 0, -9] } })
  store.endTransaction()
  assert.deepEqual(JSON.parse(store.exportJson()).objects[0].transform.position, [12, 0, -9])
  assert.equal(store.undo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [0, 0, 0])
  assert.equal(store.redo(), true)
  assert.deepEqual(createSceneObjectStore({ storage }).getSnapshot().document.objects[0].transform.position, [12, 0, -9])
})
