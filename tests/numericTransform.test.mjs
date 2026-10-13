import test from 'node:test'
import assert from 'node:assert/strict'
import { applyNumericTransformEdit, formatTransformInput } from '../src/editor/numericTransform.js'
import { createSceneObject } from '../src/editor/sceneDocument.js'
import { createSceneObjectStore } from '../src/editor/sceneStore.js'

const initialTransform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }

test('numeric transform edits update position and scale directly and convert degrees to radians', () => {
  let result = applyNumericTransformEdit(initialTransform, 'position', 0, '12.5')
  assert.equal(result.valid, true)
  assert.deepEqual(result.transform.position, [12.5, 0, 0])

  result = applyNumericTransformEdit(result.transform, 'position', 2, '-8')
  assert.deepEqual(result.transform.position, [12.5, 0, -8])

  result = applyNumericTransformEdit(result.transform, 'rotation', 1, '90')
  assert.ok(Math.abs(result.transform.rotation[1] - Math.PI / 2) < 1e-12)
  assert.equal(formatTransformInput(result.transform, 'rotation', 1), '90.00')

  result = applyNumericTransformEdit(result.transform, 'scale', 2, '1.5')
  assert.deepEqual(result.transform.scale, [1, 1, 1.5])
})

test('numeric edits reject empty, non-finite, below-ground, and non-positive or tiny scales', () => {
  for (const [field, index, value] of [
    ['position', 1, '-0.01'],
    ['scale', 0, '0'],
    ['scale', 1, '-2'],
    ['scale', 2, '0.001'],
    ['position', 0, ''],
    ['rotation', 2, 'Infinity'],
  ]) {
    const result = applyNumericTransformEdit(initialTransform, field, index, value)
    assert.equal(result.valid, false, `${field}[${index}] should reject ${value}`)
  }
})

test('a completed numeric edit autosaves and is one undo/redo step after reload', () => {
  const memory = new Map()
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
  const store = createSceneObjectStore({ storage })
  const id = store.addObject(createSceneObject('tree'))
  const tree = store.getSnapshot().document.objects[0]
  const edit = applyNumericTransformEdit(tree.transform, 'position', 0, '14')
  store.beginTransaction()
  store.updateObject(id, { transform: edit.transform })
  store.endTransaction()

  const reloaded = createSceneObjectStore({ storage })
  assert.deepEqual(reloaded.getSnapshot().document.objects[0].transform.position, [14, 0, 0])
  assert.equal(store.undo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [0, 0, 0])
  assert.equal(store.redo(), true)
  assert.deepEqual(store.getSnapshot().document.objects[0].transform.position, [14, 0, 0])
  assert.deepEqual(createSceneObjectStore({ storage }).getSnapshot().document.objects[0].transform.position, [14, 0, 0])
})
