import { getObjectTypeDefinition } from './objectCatalog.js'

export const SCENE_DOCUMENT_VERSION = 1
export const SCENE_STORAGE_KEY = 'goztepe-campus-3d:scene:v1'

export function createEmptySceneDocument() {
  return { version: SCENE_DOCUMENT_VERSION, objects: [] }
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

export function validateSceneDocument(value) {
  const errors = []
  if (!isRecord(value)) return { valid: false, errors: ['Belge bir JSON nesnesi olmalı.'] }
  if (!onlyKeys(value, ['version', 'objects'])) errors.push('Belgede şema dışı alan var.')
  if (value.version !== SCENE_DOCUMENT_VERSION) errors.push(`Desteklenmeyen belge sürümü: ${String(value.version)}.`)
  if (!Array.isArray(value.objects)) errors.push('objects alanı bir dizi olmalı.')
  if (!Array.isArray(value.objects)) return { valid: false, errors }

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
    else if (!isJsonValue(object.properties)) errors.push(`${label}.properties yalnızca geçerli JSON değerleri içermeli.`)
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
  return assertValidSceneDocument(parsed)
}

export function serializeSceneDocument(document) {
  assertValidSceneDocument(document)
  return JSON.stringify(document, null, 2)
}

export function createObjectId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `obj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function createSceneObject(objectType, options = {}) {
  const definition = getObjectTypeDefinition(objectType)
  if (!definition) throw new Error(`Kayıtlı sahne nesnesi türü bulunamadı: ${objectType}`)
  const variant = options.variant ?? definition.defaultVariant
  if (!definition.variants.includes(variant)) throw new Error(`'${objectType}' türünde '${variant}' modeli tanımlı değil.`)
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
