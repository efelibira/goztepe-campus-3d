import test from 'node:test'
import assert from 'node:assert/strict'
import { MOUSE } from 'three'
import { getOrbitMouseBindings } from '../src/editor/orbitMouseBindings.js'

test('object mode reserves left drag for object interaction and keeps right pan', () => {
  assert.deepEqual(getOrbitMouseBindings({ editMode: true, controlMode: 'object', optionPressed: false }), {
    RIGHT: MOUSE.PAN,
  })
})

test('Option plus left drag rotates the camera in object mode', () => {
  assert.deepEqual(getOrbitMouseBindings({ editMode: true, controlMode: 'object', optionPressed: true }), {
    LEFT: MOUSE.ROTATE,
    RIGHT: MOUSE.PAN,
  })
})

test('camera mode maps left drag to rotation and right drag to pan', () => {
  assert.deepEqual(getOrbitMouseBindings({ editMode: true, controlMode: 'camera', optionPressed: false }), {
    LEFT: MOUSE.ROTATE,
    RIGHT: MOUSE.PAN,
  })
})

test('normal viewing keeps the original left-drag camera rotation', () => {
  assert.deepEqual(getOrbitMouseBindings({ editMode: false, controlMode: 'object', optionPressed: false }), {
    LEFT: MOUSE.ROTATE,
    RIGHT: MOUSE.PAN,
  })
})
