import { getObjectTypeDefinition } from './objectCatalog.js'

export const SCENE_DOCUMENT_VERSION = 2
export const SCENE_STORAGE_KEY = 'goztepe-campus-3d:scene:v2'
export const LEGACY_SCENE_STORAGE_KEY = 'goztepe-campus-3d:scene:v1'

export function createEmptySceneDocument() {
  return { version: SCENE_DOCUMENT_VERSION, objects: [], buildingOverrides: {} }
}

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isVector(value, positive = false) {
  if (!Array.isArray(value) || value.length !== 3 || Object.keys(value).length !== 3) return false
  return value.every((entry) => Number.isFinite(entry) && (!positive || entry > 0))
}

function isJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  const valid = Array.isArray(value)
    ? Object.keys(value).length === value.length && value.every((entry) => isJsonValue(entry, seen))
    : isRecord(value) && Object.values(value).every((entry) => isJsonValue(entry, seen))
  seen.delete(value)
  return valid
}

function onlyKeys(record, keys) {
  return Object.keys(record).every((key) => keys.includes(key))
}

const isColor = (value) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)
const isAssetId = (value) => typeof value === 'string' && /^[a-z\d][a-z\d._-]*$/i.test(value) && !value.includes('..')

function validateModelOverride(model, label, errors) {
  if (!isRecord(model)) { errors.push(`${label} bir nesne olmalı.`); return }
  if (!onlyKeys(model, ['type', 'assetId', 'scale', 'rotation', 'offset'])) errors.push(`${label} şema dışı alan içeriyor.`)
  if (model.type !== 'glb') errors.push(`${label}.type yalnızca 'glb' olabilir.`)
  if (!isAssetId(model.assetId)) {
    errors.push(`${label}.assetId geçerli bir varlık kimliği olmalı.`)
  }
  if (!isVector(model.scale, true)) errors.push(`${label}.scale üç pozitif sayı içermeli.`)
  if (!isVector(model.rotation)) errors.push(`${label}.rotation üç sonlu sayı içermeli.`)
  if (!isVector(model.offset)) errors.push(`${label}.offset üç sonlu sayı içermeli.`)
}

function validateBuildingOverrides(value, errors) {
  if (!isRecord(value)) { errors.push('buildingOverrides bir nesne olmalı.'); return }
  for (const [id, override] of Object.entries(value)) {
    const label = `buildingOverrides[${id}]`
    if (!id.trim()) errors.push('Bina override kimliği boş olamaz.')
    if (!isRecord(override)) { errors.push(`${label} bir nesne olmalı.`); continue }
    if (!onlyKeys(override, ['name', 'heightMeters', 'facadeColor', 'roofColor', 'visible', 'model'])) errors.push(`${label} şema dışı alan içeriyor.`)
    if (Object.hasOwn(override, 'name') && (typeof override.name !== 'string' || !override.name.trim())) errors.push(`${label}.name boş olmayan bir metin olmalı.`)
    if (Object.hasOwn(override, 'heightMeters') && (!Number.isFinite(override.heightMeters) || override.heightMeters <= 0)) errors.push(`${label}.heightMeters pozitif ve sonlu olmalı.`)
    if (Object.hasOwn(override, 'facadeColor') && !isColor(override.facadeColor)) errors.push(`${label}.facadeColor #RRGGBB biçiminde olmalı.`)
    if (Object.hasOwn(override, 'roofColor') && !isColor(override.roofColor)) errors.push(`${label}.roofColor #RRGGBB biçiminde olmalı.`)
    if (Object.hasOwn(override, 'visible') && typeof override.visible !== 'boolean') errors.push(`${label}.visible boolean olmalı.`)
    if (Object.hasOwn(override, 'model')) validateModelOverride(override.model, `${label}.model`, errors)
  }
}

export function upgradeSceneDocument(value) {
  assertValidSceneDocument(value)
  if (value.version === 1) return { version: SCENE_DOCUMENT_VERSION, objects: value.objects, buildingOverrides: {} }
  return value
}

export function validateSceneDocument(value) {
  const errors = []
  if (!isRecord(value)) return { valid: false, errors: ['Belge bir JSON nesnesi olmalı.'] }
  const supportedVersion = value.version === 1 || value.version === SCENE_DOCUMENT_VERSION
  if (!supportedVersion) errors.push(`Desteklenmeyen belge sürümü: ${String(value.version)}.`)
  const allowedKeys = value.version === 1 ? ['version', 'objects'] : ['version', 'objects', 'buildingOverrides']
  if (!onlyKeys(value, allowedKeys)) errors.push('Belgede şema dışı alan var.')
  if (!Array.isArray(value.objects)) errors.push('objects alanı bir dizi olmalı.')
  if (!Array.isArray(value.objects)) return { valid: false, errors }

  if (value.version === SCENE_DOCUMENT_VERSION) validateBuildingOverrides(value.buildingOverrides, errors)

  const ids = new Set()
  for (const [index, object] of value.objects.entries()) {
    const label = `objects[${index}]`
    if (!isRecord(object)) { errors.push(`${label} bir nesne olmalı.`); continue }
    if (!onlyKeys(object, ['id', 'objectType', 'variant', 'transform', 'properties'])) errors.push(`${label} şema dışı alan içeriyor.`)
    if (typeof object.id !== 'string' || !object.id.trim()) errors.push(`${label}.id boş olmayan bir metin olmalı.`)
    else if (ids.has(object.id)) errors.push(`${label}.id tekrar ediyor: ${object.id}.`)
    else ids.add(object.id)
    if (typeof object.objectType !== 'string' || !object.objectType.trim()) errors.push(`${label}.objectType boş olmayan bir metin olmalı.`)
    if (typeof object.variant !== 'string' || !object.variant.trim()) errors.push(`${label}.variant boş olmayan bir metin olmalı.`)
    if (!isRecord(object.transform)) errors.push(`${label}.transform bir nesne olmalı.`)
    else {
      if (!onlyKeys(object.transform, ['position', 'rotation', 'scale'])) errors.push(`${label}.transform şema dışı alan içeriyor.`)
      if (!isVector(object.transform.position)) errors.push(`${label}.transform.position üç sonlu sayı içermeli.`)
      if (!isVector(object.transform.rotation)) errors.push(`${label}.transform.rotation üç sonlu sayı içermeli.`)
      if (!isVector(object.transform.scale, true)) errors.push(`${label}.transform.scale üç pozitif sayı içermeli.`)
    }
    if (!isRecord(object.properties)) errors.push(`${label}.properties bir nesne olmalı.`)
    else {
      if (!isJsonValue(object.properties)) errors.push(`${label}.properties yalnızca geçerli JSON değerleri içermeli.`)
      if (object.objectType === 'glb-model') {
        if (!isAssetId(object.variant)) errors.push(`${label}.variant GLB katalog kimliği olmalı.`)
        if (typeof object.properties.name !== 'string' || !object.properties.name.trim()) errors.push(`${label}.properties.name boş olmayan bir metin olmalı.`)
        if (!onlyKeys(object.properties, ['name'])) errors.push(`${label}.properties GLB modeli için yalnızca ad alanını içerebilir; varlık dosyası katalogda kalmalı.`)
      }
    }
  }
  return { valid: errors.length === 0, errors }
}

export function assertValidSceneDocument(value) {
  const result = validateSceneDocument(value)
  if (!result.valid) throw new Error(`Sahne kaydı geçersiz: ${result.errors.join(' ')}`)
  return value
}

export function parseSceneDocument(text) {
  let parsed
  try { parsed = JSON.parse(text) }
  catch (error) { throw new Error(`Sahne JSON'u okunamadı: ${error instanceof Error ? error.message : 'geçersiz JSON'}`) }
  return upgradeSceneDocument(assertValidSceneDocument(parsed))
}

export function serializeSceneDocument(document) {
  const current = upgradeSceneDocument(document)
  return JSON.stringify(current, null, 2)
}

export function createObjectId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function createSceneObject(objectType, options = {}) {
  const definition = getObjectTypeDefinition(objectType)
  if (!definition) throw new Error(`Kayıtlı sahne nesnesi türü bulunamadı: ${objectType}`)
  const variant = options.variant ?? definition.defaultVariant
  const dynamicGlbVariant = objectType === 'glb-model' && isAssetId(variant)
  if (!definition.variants.includes(variant) && !dynamicGlbVariant) throw new Error(`'${objectType}' türünde '${variant}' modeli tanımlı değil.`)
  return {
    id: options.id ?? createObjectId(),
    objectType,
    variant,
    transform: {
      position: options.transform?.position ?? [0, 0, 0],
      rotation: options.transform?.rotation ?? [0, 0, 0],
      scale: options.transform?.scale ?? [1, 1, 1],
    },
    properties: { ...definition.defaultProperties, ...options.properties },
  }
}
