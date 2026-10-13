import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { inspectGlb, MAX_GLB_BYTES } from '../src/data/glbImport.ts'
import { createModelImportMiddleware, isLocalImportRequest, persistImportedModel, modelImportPlugin } from '../server/modelImportPlugin.ts'
import { resolveGlbModelCatalog } from '../src/data/modelCatalog.ts'
import { createSceneObject } from '../src/editor/sceneDocument.js'
import { createSceneObjectStore } from '../src/editor/sceneStore.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

function fixture(change = () => {}) {
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, scale: [1, 3.224066734313965, 1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1.194, -1, -1], max: [1, 1, 1] }],
  }
  change(json)
  let text = JSON.stringify(json)
  text += ' '.repeat((4 - Buffer.byteLength(text) % 4) % 4)
  const encoded = Buffer.from(text), bin = Buffer.alloc(44)
  bin.writeUInt32LE(36, 0); bin.writeUInt32LE(0x004e4942, 4)
  ;[-1.194, -1, -1, 1, 1, 1, 0, 0, 1].forEach((value, i) => bin.writeFloatLE(value, 8 + i * 4))
  const out = Buffer.alloc(20 + encoded.length + bin.length)
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8)
  out.writeUInt32LE(encoded.length, 12); out.writeUInt32LE(0x4e4f534a, 16)
  encoded.copy(out, 20); bin.copy(out, 20 + encoded.length)
  return out
}
const original = fixture()
async function tempProject(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'campus-glb-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(path.join(root, 'public/models'), { recursive: true })
  await writeFile(path.join(root, 'public/models/catalog.json'), JSON.stringify({ version: 1, models: [{ id: 'existing', name: 'Existing', file: 'kept.glb' }] }))
  return root
}
async function serve(root) {
  const middleware = createModelImportMiddleware(root)
  const server = createServer((req, res) => { void middleware(req, res, () => { res.writeHead(404); res.end() }) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  return { origin, close: () => new Promise((resolve) => server.close(resolve)) }
}
const headers = (origin, overrides = {}) => ({ Origin: origin, 'Content-Type': 'application/octet-stream', 'X-Campus-Import': '1', 'X-Model-Filename': 'model.glb', 'X-Model-Name': 'Test model', ...overrides })

test('GLB inspection includes node scale and rejects malformed/external/unsafe inputs', () => {
  const result = inspectGlb(original, 'Blender bina.glb')
  assert.ok(Math.abs(result.dimensions[1] - 6.44813) < 0.0001)
  assert.ok(result.minY < 0)
  for (const file of ['../escape.glb', 'a\\escape.glb', 'model.gltf', '/a.glb', 'a\0.glb']) assert.throws(() => inspectGlb(original, file))
  assert.throws(() => inspectGlb(new Uint8Array(MAX_GLB_BYTES + 1), 'large.glb'), /50 MiB/)
  assert.throws(() => inspectGlb(Buffer.from('not a glb'), 'fake.glb'))
  const wrongHeader = Buffer.from(original); wrongHeader.writeUInt32LE(1, 4)
  assert.throws(() => inspectGlb(wrongHeader, 'old.glb'), /başlığı/)
  const wrongChunk = Buffer.from(original); wrongChunk.writeUInt32LE(0xffffffff, 12)
  assert.throws(() => inspectGlb(wrongChunk, 'bad.glb'), /bölüm/)
  for (const change of [
    (j) => { j.buffers[0].uri = 'https://remote.example/file.bin' },
    (j) => { j.images = [{ uri: 'data:image/png;base64,AA==' }] },
    (j) => { j.bufferViews[0].byteLength = 9999999 },
    (j) => { j.accessors[0].count = 9999999 },
    (j) => { j.nodes[0].children = [0] },
    (j) => { j.nodes[0].mesh = 500 },
    (j) => { j.meshes[0].primitives[0].attributes.POSITION = 500 },
    (j) => { j.extensionsUsed = ['KHR_draco_mesh_compression'] },
  ]) assert.throws(() => inspectGlb(fixture(change), 'bad.glb'))
})

test('localhost, Host, Origin, proxy and CSRF boundaries reject remote writes', () => {
  const request = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'x-campus-import': '1' } }
  assert.equal(isLocalImportRequest(request), true)
  assert.equal(isLocalImportRequest({ ...request, socket: { remoteAddress: '192.168.1.5' } }), false)
  for (const patch of [
    { origin: undefined }, { origin: 'https://evil.example' }, { host: 'evil.example:5173', origin: 'http://evil.example:5173' },
    { 'x-campus-import': undefined }, { 'x-forwarded-for': '192.168.1.5' }, { 'sec-fetch-site': 'cross-site' },
  ]) assert.equal(isLocalImportRequest({ ...request, headers: { ...request.headers, ...patch } }), false)
  const config = { server: { host: '0.0.0.0', cors: true } }
  modelImportPlugin().configResolved(config)
  assert.equal(config.server.host, '127.0.0.1')
  assert.equal(config.server.cors, false)
  assert.equal(modelImportPlugin().apply, 'serve')
  assert.equal(modelImportPlugin().configurePreviewServer, undefined)
})

test('HTTP upload, duplicate filenames, catalog refresh and a fresh server preserve files and IDs', async (t) => {
  const root = await tempProject(t)
  let server = await serve(root)
  t.after(() => server.close())
  async function upload(bytes = original, extraHeaders = {}) {
    return fetch(`${server.origin}/__dev/models/import`, { method: 'POST', headers: headers(server.origin, extraHeaders), body: bytes })
  }
  assert.equal((await upload(original, { Origin: 'https://remote.example' })).status, 403)
  assert.equal((await upload(Buffer.from('fake'))).status, 400)
  assert.equal((await upload(original, { 'X-Model-Filename': encodeURIComponent('../bad.glb') })).status, 400)
  const firstResponse = await upload()
  assert.equal(firstResponse.status, 201)
  const first = await firstResponse.json()
  const secondResponse = await upload()
  assert.equal(secondResponse.status, 201)
  const second = await secondResponse.json()
  assert.notEqual(first.model.id, second.model.id)
  assert.notEqual(first.model.file, second.model.file)
  assert.deepEqual(await readFile(path.join(root, 'public/models', first.model.file)), original)
  await server.close()
  server = await serve(root)
  const catalog = JSON.parse(await readFile(path.join(root, 'public/models/catalog.json'), 'utf8'))
  assert.equal(catalog.models.length, 3)
  assert.equal(catalog.models[0].id, 'existing')
  assert.equal(resolveGlbModelCatalog(catalog)[1].url, `/models/${first.model.file}`)
  assert.equal((await upload()).status, 201)
  assert.equal((await readdir(path.join(root, 'public/models/imported'))).length, 3)
  assert.equal((await readdir(path.join(root, 'public/models'))).some((s) => s.endsWith('.lock') || s.endsWith('.tmp')), false)
})

test('invalid catalog is reported intact, and symlinked storage cannot escape the project', async (t) => {
  const root = await tempProject(t), catalogPath = path.join(root, 'public/models/catalog.json')
  const invalid = JSON.stringify({ version: 1, models: [{ name: 'Broken', url: '/models/a.glb' }] })
  await writeFile(catalogPath, invalid)
  await assert.rejects(persistImportedModel(root, original, 'model.glb', 'Model'), /Mevcut katalog değiştirilmedi/)
  assert.equal(await readFile(catalogPath, 'utf8'), invalid)
  assert.deepEqual(await readdir(path.join(root, 'public/models/imported')), [])
  await rm(path.join(root, 'public/models/imported'), { recursive: true })
  const external = await mkdtemp(path.join(tmpdir(), 'campus-outside-'))
  t.after(() => rm(external, { recursive: true, force: true }))
  await symlink(external, path.join(root, 'public/models/imported'))
  await assert.rejects(persistImportedModel(root, original, 'model.glb', 'Model'), /sembolik/)
  assert.deepEqual(await readdir(external), [])
})

test('imported GLB renders via loader and its ID works for building and reusable scene records', async (t) => {
  const root = await tempProject(t)
  const { model } = await persistImportedModel(root, original, 'model.glb', 'Model')
  const bytes = await readFile(path.join(root, 'public/models', model.file))
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  let meshes = 0
  gltf.scene.traverse((object) => { if (object.isMesh) { meshes++; assert.ok(object.geometry.attributes.position.count > 0); object.geometry.dispose(); object.material.dispose() } })
  assert.ok(meshes > 0)
  const store = createSceneObjectStore()
  store.addObject(createSceneObject('glb-model', { variant: model.id, properties: { name: model.name } }))
  store.addObject(createSceneObject('glb-model', { variant: model.id, properties: { name: 'Second instance' } }))
  store.updateBuildingOverride('way/123', { model: { type: 'glb', assetId: model.id, offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } })
  const restored = createSceneObjectStore()
  restored.importJson(store.exportJson())
  assert.equal(restored.getSnapshot().document.objects.length, 2)
  assert.equal(restored.getSnapshot().document.buildingOverrides['way/123'].model.assetId, model.id)
  store.undo(); assert.equal(store.getSnapshot().document.buildingOverrides['way/123'], undefined)
  store.redo(); assert.equal(store.getSnapshot().document.buildingOverrides['way/123'].model.assetId, model.id)
})
