import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent } from 'react'
import CampusScene from './scene/CampusScene'
import { loadCampusData } from './data/loadCampusData'
import { resolveBuilding } from './data/resolveBuilding'
import type { CampusData, ResolvedBuilding } from './types/campus'
import { CAMERA_CONFIG, CAMERA_DISTANCE_LIMITS } from './scene/cameraConfig.js'
import { createSceneObjectStore } from './editor/sceneStore.js'
import { createSceneObject } from './editor/sceneDocument.js'
import { OBJECT_TYPE_CATALOG } from './editor/objectCatalog.js'
import { getOrbitMouseBindings } from './editor/orbitMouseBindings.js'
import type { EditorControlMode } from './editor/orbitMouseBindings.js'
import { applyNumericTransformEdit } from './editor/numericTransform.js'
import type { NumericTransformField } from './editor/numericTransform.js'
import NumericTransformPanel from './components/NumericTransformPanel'

function getLocalStorageSafely(): Storage | undefined {
  try { return window.localStorage }
  catch { return undefined }
}

export default function App() {
  const [data, setData] = useState<CampusData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [editorError, setEditorError] = useState('')
  const [editMode, setEditMode] = useState(false)
  const [controlMode, setControlMode] = useState<EditorControlMode>('object')
  const [optionPressed, setOptionPressed] = useState(false)
  const [placementType, setPlacementType] = useState<string | null>(null)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null)
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
  const [transformDragging, setTransformDragging] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)
  const orbitControlsRef = useRef<OrbitControlsImpl>(null)
  const interactionConfigRef = useRef({ editMode, controlMode, optionPressed })
  interactionConfigRef.current = { editMode, controlMode, optionPressed }
  const orbitMouseBindings = getOrbitMouseBindings({ editMode, controlMode, optionPressed })
  const [sceneStore] = useState(() => createSceneObjectStore({ storage: getLocalStorageSafely() }))
  const sceneState = useSyncExternalStore(sceneStore.subscribe, sceneStore.getSnapshot, sceneStore.getSnapshot)

  useEffect(() => {
    let cancelled = false
    loadCampusData()
      .then((loaded) => { if (!cancelled) setData(loaded) })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Kampüs verisi yüklenemedi.')
      })
    return () => { cancelled = true }
  }, [])

  const buildings = useMemo<ResolvedBuilding[]>(() => {
    if (!data) return []
    return data.buildings.features.map((feature) => resolveBuilding(
      feature,
      data.overrides,
      data.visualOverrides.buildings,
    ))
  }, [data])

  const selected = buildings.find((building) => building.id === selectedId) ?? null
  const estimatedCount = buildings.filter((building) => building.confidenceLabel !== 'Doğrulanmış yükseklik düzeltmesi').length
  const selectedObject = sceneState.document.objects.find((object) => object.id === selectedObjectId) ?? null

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!editMode || transformDragging) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return
      if (event.key === 'Escape') { setPlacementType(null); setSelectedObjectId(null); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) sceneStore.redo()
        else sceneStore.undo()
        setSelectedObjectId(null)
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedObjectId) {
        event.preventDefault()
        sceneStore.removeObject(selectedObjectId)
        setSelectedObjectId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editMode, sceneStore, selectedObjectId, transformDragging])

  useEffect(() => {
    const syncOptionState = (pressed: boolean) => {
      setOptionPressed(pressed)
      const controls = orbitControlsRef.current
      if (controls) controls.mouseButtons = getOrbitMouseBindings({ ...interactionConfigRef.current, optionPressed: pressed })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt' || event.altKey) syncOptionState(true)
    }
    const onKeyUp = (event: KeyboardEvent) => syncOptionState(event.altKey)
    const onPointerDown = (event: PointerEvent) => syncOptionState(event.altKey)
    const onBlur = () => syncOptionState(false)
    const onVisibilityChange = () => { if (document.hidden) syncOptionState(false) }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    // Capture runs before OrbitControls handles pointerdown, so Option+drag works on its first frame.
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const toggleEditMode = () => {
    if (transformDragging) endTransform()
    setEditMode((current) => !current)
    setPlacementType(null)
    setSelectedObjectId(null)
    setSelectedId(null)
    setEditorError('')
  }

  const placeObject = (position: [number, number, number]) => {
    if (!placementType) return
    try {
      const object = createSceneObject(placementType, { transform: { position } })
      const id = sceneStore.addObject(object)
      setSelectedObjectId(id)
      setPlacementType(null)
      setSelectedId(null)
      setEditorError('')
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : 'Nesne yerleştirilemedi.')
    }
  }

  const exportScene = () => {
    try {
      const blob = new Blob([sceneStore.exportJson()], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'goztepe-campus-scene.json'
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setEditorError('')
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : 'Sahne dışa aktarılamadı.')
    }
  }

  const importScene = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      sceneStore.importJson(await file.text())
      setSelectedObjectId(null)
      setPlacementType(null)
      setEditorError('')
    } catch (cause) {
      setEditorError(cause instanceof Error ? cause.message : 'Dosya doğrulanamadı; mevcut sahne korundu.')
    }
  }

  const deleteSelectedObject = () => {
    if (!selectedObjectId) return
    sceneStore.removeObject(selectedObjectId)
    setSelectedObjectId(null)
  }

  const endTransform = () => {
    sceneStore.endTransaction()
    setTransformDragging(false)
  }

  const commitNumericTransform = (field: NumericTransformField, index: number, rawValue: string) => {
    if (!selectedObject) return 'Önce bir nesne seçin.'
    const result = applyNumericTransformEdit(selectedObject.transform, field, index, rawValue)
    if (!result.valid) return result.error
    if (result.value === selectedObject.transform[field][index]) return null
    if (!sceneStore.beginTransaction()) return 'Nesne şu anda sürükleniyor; düzenleme tamamlanınca tekrar deneyin.'
    try {
      sceneStore.updateObject(selectedObject.id, { transform: result.transform })
      sceneStore.endTransaction()
      return null
    } catch (cause) {
      sceneStore.cancelTransaction()
      return cause instanceof Error ? cause.message : 'Dönüşüm kaydedilemedi.'
    }
  }

  return (
    <main className="app-shell">
      <Canvas
        className="campus-canvas"
        shadows
        dpr={[1, 1.75]}
        camera={CAMERA_CONFIG}
        onPointerMissed={() => {
          // TransformControls handles are native raycasts outside the R3F event graph.
          // Do not treat their drag/release as an empty-scene click and detach the gizmo.
          if (transformDragging) return
          if (editMode) setSelectedObjectId(null)
          else setSelectedId(null)
        }}
      >
        <Suspense fallback={null}>
          {data && (
            <CampusScene
              data={data}
              buildings={buildings}
              selectedId={selectedId}
              sceneObjects={sceneState.document.objects}
              editMode={editMode}
              controlMode={controlMode}
              optionPressed={optionPressed}
              placementActive={placementType !== null}
              selectedObjectId={selectedObjectId}
              transformMode={transformMode}
              onSelect={setSelectedId}
              onClearSelection={() => {
                if (transformDragging) return
                if (editMode) setSelectedObjectId(null)
                else setSelectedId(null)
              }}
              onSelectObject={setSelectedObjectId}
              onPlaceObject={placeObject}
              onTransformUpdate={(id, transform) => sceneStore.updateObject(id, { transform })}
              onTransformStart={() => { sceneStore.beginTransaction(); setTransformDragging(true) }}
              onTransformEnd={endTransform}
              onDirectDragStart={() => {
                const started = sceneStore.beginTransaction()
                if (started) setTransformDragging(true)
                return started
              }}
              onDirectDragEnd={(id, position) => {
                try {
                  sceneStore.updateObject(id, { transform: { position } })
                  sceneStore.endTransaction()
                } catch (cause) {
                  sceneStore.cancelTransaction()
                  setEditorError(cause instanceof Error ? cause.message : 'Nesne konumu kaydedilemedi.')
                } finally {
                  setTransformDragging(false)
                }
              }}
              onDirectDragCancel={() => {
                sceneStore.cancelTransaction()
                setTransformDragging(false)
              }}
            />
          )}
        </Suspense>
        <OrbitControls
          ref={orbitControlsRef}
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          enabled={!transformDragging}
          mouseButtons={orbitMouseBindings}
          dampingFactor={0.08}
          minDistance={CAMERA_DISTANCE_LIMITS.min}
          maxDistance={CAMERA_DISTANCE_LIMITS.max}
          minPolarAngle={0.16}
          maxPolarAngle={Math.PI / 2.04}
        />
      </Canvas>

      <header className="project-card">
        <div className="eyebrow">MARMARA ÜNİVERSİTESİ</div>
        <h1>Göztepe Kampüs 3D</h1>
        <p>{data ? `${buildings.length} bina · bağımsız maket prototipi` : 'Kampüs verisi yükleniyor…'}</p>
      </header>

      <button className="mode-toggle" onClick={toggleEditMode} aria-pressed={editMode}>
        {editMode ? 'Düzenlemeyi bitir' : 'Maket düzenle'}
      </button>

      <aside className="help-card">
        <strong>Gezinme</strong>
        {editMode && controlMode === 'object' ? <>
          <span>Sol sürükle: nesne / araç</span>
          <span>Option + sol sürükle: kamerayı döndür</span>
        </> : <span>Sol sürükle: kamerayı döndür</span>}
        <span>Sağ sürükle: kamerayı kaydır</span>
        <span>Kaydırma / trackpad: yakınlaş</span>
      </aside>

      {editMode && <aside className="editor-panel" aria-label="Maket düzenleme araçları">
        <div className="editor-panel-heading">
          <div><div className="eyebrow">DÜZENLEME MODU</div><strong>Nesne araçları</strong></div>
          <button className="close-button" onClick={toggleEditMode} aria-label="Düzenleme modunu kapat">×</button>
        </div>
        <div className="control-mode-switch" role="group" aria-label="Düzenleme kontrol modu">
          <button className={controlMode === 'camera' ? 'tool-button active' : 'tool-button'} aria-pressed={controlMode === 'camera'} disabled={transformDragging} onClick={() => setControlMode('camera')}>Kamera</button>
          <button className={controlMode === 'object' ? 'tool-button active' : 'tool-button'} aria-pressed={controlMode === 'object'} disabled={transformDragging} onClick={() => setControlMode('object')}>Nesne</button>
        </div>
        <p className="editor-hint">{controlMode === 'object' ? 'Nesne seçimi ve dönüşüm etkin. Option basılıyken sol sürükleme kamerayı döndürür.' : 'Sol sürükleme kamerayı döndürür; nesneleri seçebilir, ancak dönüştüremezsiniz.'}</p>
        <div className="object-palette">
          {Object.entries(OBJECT_TYPE_CATALOG).map(([type, definition]) => <button
            key={type}
            className={placementType === type ? 'tool-button active' : 'tool-button'}
            onClick={() => { setPlacementType((current) => current === type ? null : type); setSelectedObjectId(null) }}
          >+ {definition.label}</button>)}
        </div>
        <p className="editor-hint">{placementType ? 'Kampüs zeminine tıklayarak yerleştir. Esc ile iptal et.' : 'Bir nesne seç veya yerleştirmek için tür seç.'}</p>
        {selectedObject && <div className="selected-object-info">
          <strong>{OBJECT_TYPE_CATALOG[selectedObject.objectType]?.label ?? selectedObject.objectType}</strong>
          <code>{selectedObject.id}</code>
          <div className="transform-modes" aria-label="Dönüşüm aracı">
            {([['translate', 'Taşı'], ['rotate', 'Döndür'], ['scale', 'Ölçekle']] as const).map(([mode, label]) => <button key={mode} className={transformMode === mode ? 'tool-button active' : 'tool-button'} onClick={() => setTransformMode(mode)}>{label}</button>)}
          </div>
          <NumericTransformPanel
            transform={selectedObject.transform}
            disabled={transformDragging}
            onCommit={commitNumericTransform}
          />
          <button className="danger-button" onClick={deleteSelectedObject}>Seçili nesneyi sil</button>
        </div>}
        <div className="editor-actions">
          <button className="tool-button" onClick={() => { sceneStore.undo(); setSelectedObjectId(null) }} disabled={!sceneState.canUndo || transformDragging}>Geri al</button>
          <button className="tool-button" onClick={() => { sceneStore.redo(); setSelectedObjectId(null) }} disabled={!sceneState.canRedo || transformDragging}>Yinele</button>
          <button className="tool-button" onClick={exportScene}>JSON dışa aktar</button>
          <button className="tool-button" onClick={() => importInputRef.current?.click()}>JSON içe aktar</button>
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importScene} hidden />
        </div>
        {sceneState.persistenceError && <p className="editor-error" role="status">{sceneState.persistenceError}</p>}
        {editorError && <p className="editor-error" role="status">{editorError}</p>}
      </aside>}

      {selected && !editMode && (
        <section className="building-card" aria-live="polite">
          <button className="close-button" onClick={() => setSelectedId(null)} aria-label="Seçimi kapat">×</button>
          <div className="eyebrow">SEÇİLEN BİNA</div>
          <h2>{selected.name}</h2>
          <p className="height-note">{selected.heightLabel} · {selected.confidenceLabel}</p>
          {selected.units.length > 0 && (
            <ul>
              {selected.units.slice(0, 5).map((unit, index) => (
                <li key={`${unit.name}-${index}`}>
                  {unit.name}{unit.category ? <small>{unit.category}</small> : null}
                </li>
              ))}
            </ul>
          )}
          <small className="osm-id">OSM: {selected.id}</small>
        </section>
      )}

      {error && <div className="error-card" role="alert">{error}</div>}

      {data && <div className="estimate-note">Yüksekliklerin {estimatedCount} tanesi doğrulanmamış tahmindir.</div>}

      <footer className="attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
        <span>·</span>
        <a href="https://www.marmara.edu.tr/kampus-haritasi" target="_blank" rel="noreferrer">Marmara Üniversitesi Kampüs Haritası</a>
      </footer>
    </main>
  )
}
