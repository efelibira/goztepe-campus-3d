import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBuilding } from '../src/data/resolveBuilding.ts'

const feature = {
  type: 'Feature',
  id: 'way/123',
  geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
  properties: { name: 'Kaynak adı', 'building:levels': 3, displayHeight: 10, heightSource: 'placeholder' },
}

test('source building resolution keeps its ID and directory information while applying independent edit overrides', () => {
  const resolved = resolveBuilding(
    feature,
    { 'osm:way/123': { name: 'Birim adı', units: [{ name: 'Fakülte' }] } },
    { 'osm:way/123': { color: '#AABBCC', roofColor: '#DDEEFF' } },
    { 'way/123': { name: 'Düzenlenmiş ad', heightMeters: 22, facadeColor: '#112233', roofColor: '#445566', visible: false } },
  )
  assert.equal(resolved.id, 'way/123')
  assert.equal(resolved.name, 'Düzenlenmiş ad')
  assert.deepEqual(resolved.units, [{ name: 'Fakülte' }])
  assert.equal(resolved.heightMeters, 22)
  assert.equal(resolved.color, '#112233')
  assert.equal(resolved.roofColor, '#445566')
  assert.equal(resolved.visible, false)
  assert.equal(resolved.confidenceLabel, 'Kullanıcı düzenlemesi (doğrulanmamış)')
})

test('an empty edit override resolves back to source and baseline presentation values', () => {
  const resolved = resolveBuilding(feature, {}, { 'osm:way/123': { heightMeters: 15, color: '#AABBCC' } }, {})
  assert.equal(resolved.id, 'way/123')
  assert.equal(resolved.name, 'Kaynak adı')
  assert.equal(resolved.heightMeters, 15)
  assert.equal(resolved.color, '#AABBCC')
  assert.equal(resolved.roofColor, '#AABBCC')
  assert.equal(resolved.visible, true)
})
