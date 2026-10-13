import test from 'node:test'
import assert from 'node:assert/strict'
import { getGlbCatalogAsset, loadGlbModelCatalog, resolveGlbModelCatalog, validateGlbModelCatalog } from '../src/data/modelCatalog.ts'

test('model catalog resolves stable IDs to safe model paths under public/models', async () => {
  const catalog = { version: 1, models: [
    { id: 'fen-edebiyat', name: 'Fen-Edebiyat', file: 'buildings/fen-edebiyat.glb' },
    { id: 'library-entrance', name: 'Kütüphane Girişi', file: 'objects/library.glb' },
  ] }
  assert.equal(validateGlbModelCatalog(catalog).valid, true)
  assert.deepEqual(resolveGlbModelCatalog(catalog).map(({ id, url }) => [id, url]), [
    ['fen-edebiyat', '/models/buildings/fen-edebiyat.glb'],
    ['library-entrance', '/models/objects/library.glb'],
  ])
  const assets = Object.fromEntries(resolveGlbModelCatalog(catalog).map((asset) => [asset.id, asset]))
  assert.equal(getGlbCatalogAsset('fen-edebiyat', assets)?.url, '/models/buildings/fen-edebiyat.glb')
  assert.equal(getGlbCatalogAsset('missing-model', assets), null)
  assert.deepEqual(await loadGlbModelCatalog(async () => ({ ok: true, json: async () => ({ version: 1, models: [] }) })), [])
})

test('invalid, duplicate, and path-traversing catalog records are rejected', () => {
  assert.equal(validateGlbModelCatalog({ version: 1, models: [{ id: 'same', name: 'A', file: 'a.glb' }, { id: 'same', name: 'B', file: 'b.glb' }] }).valid, false)
  for (const file of ['../secret.glb', 'buildings/../../secret.glb', '/absolute.glb', 'http://host/model.glb', 'tree.obj']) {
    assert.equal(validateGlbModelCatalog({ version: 1, models: [{ id: 'bad-model', name: 'Bad', file }] }).valid, false, file)
  }
  assert.throws(() => resolveGlbModelCatalog({ version: 1, models: [{ id: 'bad', name: 'Bad', file: '../bad.glb' }] }), /kataloğu geçersiz/)
})
