import { useRef, useState } from 'react'
import type { GlbCatalogAsset } from '../data/modelCatalog'
import { loadGlbModelCatalog } from '../data/modelCatalog'
import { inspectGlb, MAX_GLB_BYTES } from '../data/glbImport'
import type { GlbInspection } from '../data/glbImport'
import type { Material, Mesh, Texture } from 'three'

type Candidate = { file: File; bytes: Uint8Array<ArrayBuffer>; inspection: GlbInspection }

async function checkRenderable(bytes: Uint8Array<ArrayBuffer>) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer, '')
  // This independent validation parse never enters useGLTF's render cache.
  const geometries = new Set<Mesh['geometry']>(), materials = new Set<Material>(), textures = new Set<Texture>()
  for (const scene of gltf.scenes) scene.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.geometry) geometries.add(mesh.geometry)
    for (const material of mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []) {
      materials.add(material)
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value)
    }
  })
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) { texture.dispose(); texture.source.data?.close?.() }
}

export default function ModelImportPanel({ onImported, disabled }: { onImported: (assets: GlbCatalogAsset[]) => void; disabled: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  // A ref prevents overlapping drops before React has rendered the busy state.
  const working = useRef(false)

  const choose = async (files: FileList | null) => {
    if (working.current || disabled || !files?.length) return
    setError(''); setMessage(''); setCandidate(null)
    if (files.length !== 1) { setError('Her seferinde tek bir GLB dosyası seçin.'); return }
    working.current = true; setBusy(true)
    try {
      const file = files[0]
      if (file.size > MAX_GLB_BYTES) throw new Error('Dosya en fazla 50 MiB olabilir.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const inspection = inspectGlb(bytes, file.name)
      await checkRenderable(bytes)
      setCandidate({ file, bytes, inspection })
      setName(file.name.replace(/\.glb$/i, '').slice(0, 120))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'GLB okunamadı.') }
    finally { working.current = false; setBusy(false); if (input.current) input.current.value = '' }
  }

  const upload = async () => {
    if (!candidate || working.current || disabled) return
    working.current = true; setBusy(true); setError(''); setMessage('')
    let saved = false
    try {
      const response = await fetch('/__dev/models/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream', 'X-Campus-Import': '1',
          'X-Model-Filename': encodeURIComponent(candidate.file.name), 'X-Model-Name': encodeURIComponent(name.trim()),
        },
        body: candidate.bytes,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Model kaydedilemedi.')
      saved = true
      setCandidate(null)
      onImported(await loadGlbModelCatalog())
      setMessage(`“${name.trim()}” kütüphaneye eklendi. Paletten yerleştirebilir veya bir binaya bağlayabilirsiniz.`)
    } catch (cause) {
      setError(saved ? 'Model kaydedildi ancak katalog yenilenemedi. Modeli tekrar yüklemek yerine sayfayı yenileyin.' : cause instanceof Error ? cause.message : 'İçe aktarma başarısız.')
    } finally { working.current = false; setBusy(false) }
  }

  return <section className="model-import" aria-label="Model İçe Aktar">
    <strong>Model İçe Aktar</strong>
    <div className={`model-dropzone${dragOver ? ' drag-over' : ''}`}
      onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy && !disabled) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setDragOver(false); void choose(event.dataTransfer.files) }}>
      <span>Blender’dan aldığınız .glb dosyasını buraya bırakın.</span>
      <button className="tool-button" disabled={busy || disabled} onClick={() => input.current?.click()}>GLB dosyası seç</button>
      <small>En fazla 50 MiB · Yalnızca yerel geliştirme</small>
      <input ref={input} type="file" accept=".glb" hidden aria-label="GLB dosyası" onChange={(event) => { void choose(event.target.files) }} />
    </div>
    {candidate && <div className="model-import-preview">
      <label>Model adı<input value={name} maxLength={120} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      <small>{candidate.file.name} · {(candidate.file.size / 1024 / 1024).toFixed(2)} MiB</small>
      <small>Yaklaşık X / Y / Z: {candidate.inspection.dimensions.map((n) => n.toFixed(2)).join(' / ')} m</small>
      {Math.abs(candidate.inspection.minY) > 0.01 && <small>Model tabanı Y={candidate.inspection.minY.toFixed(2)} m. Zemine oturması için Blender’da başlangıç noktasını düzeltin veya sahnede konum ayarı yapın.</small>}
      <button className="tool-button" disabled={busy || disabled || !name.trim()} onClick={() => { void upload() }}>Kütüphaneye kaydet</button>
    </div>}
    {busy && <small role="status">Model doğrulanıyor / kaydediliyor…</small>}
    {message && <small role="status">{message}</small>}
    {error && <small className="editor-error" role="alert">{error}</small>}
  </section>
}
