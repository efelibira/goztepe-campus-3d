import { Box3, Matrix4, Quaternion, Vector3 } from 'three'

export const MAX_GLB_BYTES = 50 * 1024 * 1024
export type GlbInspection = { dimensions: [number, number, number]; minY: number }

/** Structural import gate, not a complete Khronos conformance validator. No external resources. */
export function inspectGlb(bytes: Uint8Array, filename: string): GlbInspection {
  const fail = (message: string): never => { throw new Error(`GLB geçersiz: ${message}`) }
  if (!filename.toLowerCase().endsWith('.glb') || /[/\\\x00-\x1f]/.test(filename) || filename.includes('..')) fail('yalnızca güvenli bir .glb dosya adı kabul edilir.')
  if (bytes.byteLength > MAX_GLB_BYTES) fail('dosya en fazla 50 MiB olabilir.')
  if (bytes.byteLength < 28) fail('başlık veya JSON bölümü eksik.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) fail('GLB 2.0 başlığı veya dosya uzunluğu hatalı.')
  let json: any
  let binLength = 0
  let chunks = 0
  for (let offset = 12; offset < bytes.byteLength;) {
    if (offset + 8 > bytes.byteLength) fail('bölüm başlığı eksik.')
    const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true)
    if (length % 4 || offset + 8 + length > bytes.byteLength) fail('bölüm boyutu veya hizalaması hatalı.')
    if (chunks === 0 && type === 0x4e4f534a) {
      if (length > 8 * 1024 * 1024) fail('JSON bölümü çok büyük.')
      try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 8, offset + 8 + length))) }
      catch { fail('JSON bölümü okunamıyor.') }
    } else if (chunks === 1 && type === 0x004e4942) binLength = length
    else fail('yalnızca JSON ve isteğe bağlı BIN bölümü desteklenir.')
    offset += 8 + length
    chunks++
  }
  if (!json || json.asset?.version !== '2.0') fail('glTF asset.version 2.0 olmalı.')
  // Embedded buffers/images only; never let the loader request arbitrary URLs or local files.
  const scan = (value: any, depth = 0) => {
    if (depth > 64) fail('JSON iç içe geçme sınırı aşıldı.')
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (key === 'uri') fail('dış veya data URI kaynakları desteklenmez; texture ve buffer verilerini GLB içine gömün.')
      scan(child, depth + 1)
    }
  }
  scan(json)
  const unsupported = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu']
  if (unsupported.some((extension) => json.extensionsUsed?.includes(extension))) fail('sıkıştırılmış Draco/Meshopt/KTX2 modelleri bu içe aktarıcıda desteklenmiyor.')
  for (const key of ['buffers', 'bufferViews', 'accessors', 'meshes', 'nodes', 'scenes', 'images']) {
    if (json[key] !== undefined && (!Array.isArray(json[key]) || json[key].length > 10000)) fail(`${key} dizisi hatalı veya çok büyük.`)
  }
  const ref = (list: any[], index: any, label: string): any => {
    if (!Number.isInteger(index) || index < 0 || !list?.[index] || typeof list[index] !== 'object') fail(`${label} referansı hatalı.`)
    return list[index]
  }
  const integer = (value: any) => Number.isSafeInteger(value) && value >= 0
  const buffers = json.buffers ?? [], views = json.bufferViews ?? [], accessors = json.accessors ?? []
  if (buffers.length !== 1 || !integer(buffers[0]?.byteLength) || buffers[0].byteLength > binLength || binLength - buffers[0].byteLength > 3) fail('gömülü BIN buffer boyutu hatalı.')
  for (const item of views) {
    if (!item || item.buffer !== 0 || !integer(item.byteLength) || !integer(item.byteOffset ?? 0) || (item.byteOffset ?? 0) + item.byteLength > buffers[0].byteLength) fail('bufferView sınırları hatalı.')
  }
  const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
  const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
  for (const item of accessors) {
    if (!item || !components[item.type] || !sizes[item.componentType] || !integer(item.count) || item.count > 5_000_000 || !integer(item.byteOffset ?? 0)) fail('accessor biçimi veya boyutu hatalı.')
    if (item.sparse) fail('sparse accessor için Blender’dan standart mesh dışa aktarın.')
    const bufferView = ref(views, item.bufferView, 'accessor.bufferView')
    const packed = components[item.type] * sizes[item.componentType]
    const stride = bufferView.byteStride ?? packed
    if (!integer(stride) || stride < packed || stride > 252 || (bufferView.byteStride !== undefined && stride % 4)
      || (item.byteOffset ?? 0) + Math.max(0, item.count - 1) * stride + (item.count ? packed : 0) > bufferView.byteLength) fail('accessor buffer sınırını aşıyor.')
  }
  for (const image of json.images ?? []) {
    ref(views, image?.bufferView, 'image.bufferView')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType)) fail('texture biçimi PNG, JPEG veya WebP olmalı.')
  }
  const vec = (value: any, length: number): boolean => Array.isArray(value) && value.length === length && value.every((n: any) => typeof n === 'number' && Number.isFinite(n))
  const meshBounds = (json.meshes ?? []).map((mesh: any) => {
    if (!Array.isArray(mesh?.primitives) || !mesh.primitives.length) fail('mesh primitive eksik.')
    const box = new Box3()
    for (const primitive of mesh.primitives) {
      const position = ref(accessors, primitive?.attributes?.POSITION, 'POSITION')
      if (position.type !== 'VEC3' || !vec(position.min, 3) || !vec(position.max, 3) || position.min.some((n: number, i: number) => n > position.max[i])) fail('POSITION sınırları eksik veya geçersiz.')
      for (const index of Object.values(primitive.attributes)) ref(accessors, index, 'attribute')
      if (primitive.indices !== undefined) ref(accessors, primitive.indices, 'indices')
      box.union(new Box3(new Vector3(...position.min), new Vector3(...position.max)))
    }
    return box
  })
  const nodes = json.nodes ?? [], parents = new Set<number>()
  for (const node of nodes) {
    if (!node || typeof node !== 'object') fail('node hatalı.')
    if (node.matrix !== undefined && !vec(node.matrix, 16)) fail('node matrix hatalı.')
    for (const [key, length] of [['translation', 3], ['rotation', 4], ['scale', 3]] as const) if (node[key] !== undefined && !vec(node[key], length)) fail(`node ${key} hatalı.`)
    if (node.mesh !== undefined) ref(json.meshes, node.mesh, 'node.mesh')
    if (node.children !== undefined && !Array.isArray(node.children)) fail('node children hatalı.')
    for (const index of node.children ?? []) {
      ref(nodes, index, 'node.children')
      if (parents.has(index)) fail('node birden fazla ebeveyne bağlı.')
      parents.add(index)
    }
  }
  const bounds = new Box3(), stack = new Set<number>(), visited = new Set<number>()
  const walk = (index: number, parent: Matrix4, include: boolean, depth: number) => {
    if (depth > 128 || stack.has(index)) fail('node döngüsü veya aşırı derin hiyerarşi.')
    const node = ref(nodes, index, 'scene.node')
    stack.add(index); visited.add(index)
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])))
    const world = parent.clone().multiply(local)
    if (include && node.mesh !== undefined) bounds.union(meshBounds[node.mesh].clone().applyMatrix4(world))
    for (const child of node.children ?? []) walk(child, world, include, depth + 1)
    stack.delete(index)
  }
  const scene = ref(json.scenes, json.scene ?? 0, 'scene')
  if (!Array.isArray(scene.nodes)) fail('scene.nodes eksik.')
  for (const index of scene.nodes) walk(index, new Matrix4(), true, 0)
  // Also reject cycles in nodes outside the default scene.
  for (let index = 0; index < nodes.length; index++) if (!visited.has(index)) walk(index, new Matrix4(), false, 0)
  const size = bounds.getSize(new Vector3())
  if (bounds.isEmpty() || ![...size.toArray(), bounds.min.y].every(Number.isFinite)) fail('görüntülenebilir mesh veya geçerli boyut bulunamadı.')
  return { dimensions: size.toArray(), minY: bounds.min.y }
}
