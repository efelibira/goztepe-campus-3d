import { Component, lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { useThree } from '@react-three/fiber'
import { OBJECT_MODEL_REGISTRY } from './ObjectModels'
import type { SceneObjectRecord, SceneObjectTransform } from '../editor/sceneDocument'
import { getObjectTypeDefinition } from '../editor/objectCatalog.js'
import { hasDirectDragThreshold, positionFromGroundDrag } from '../editor/groundPlaneDrag.js'
import type { GlbCatalogAsset } from '../data/modelCatalog'
import { getGlbCatalogAsset } from '../data/modelCatalog.js'

function UnavailableModel() {
  return <mesh position={[0, 0.5, 0]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="#D9B9B2" wireframe />
  </mesh>
}

class GlbAssetErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

const GLBObjectModel = lazy(() => import('./GLBObjectModel'))

export type PlacedObjectsLayerProps = {
  objects: SceneObjectRecord[]
  modelAssets: Record<string, GlbCatalogAsset>
  editable: boolean
  transformEnabled: boolean
  optionPressed: boolean
  selectedId: string | null
  placementActive: boolean
  isInsideCampus: (x: number, z: number) => boolean
  transformMode: 'translate' | 'rotate' | 'scale'
  onSelect: (id: string) => void
  onTransformUpdate: (id: string, transform: SceneObjectTransform) => void
  onTransformStart: () => void
  onTransformEnd: () => void
  onTransformCancel: () => void
  onDirectDragStart: (id: string) => boolean
  onDirectDragEnd: (id: string, position: [number, number, number]) => void
  onDirectDragCancel: () => void
}

export default function PlacedObjectsLayer({
  objects, modelAssets, editable, transformEnabled, optionPressed, selectedId, placementActive, isInsideCampus, transformMode,
  onSelect, onTransformUpdate, onTransformStart, onTransformEnd, onTransformCancel, onDirectDragStart, onDirectDragEnd, onDirectDragCancel,
}: PlacedObjectsLayerProps) {
  return <group>
    {objects.map((object) => {
      const definition = getObjectTypeDefinition(object.objectType)
      const typeModels = OBJECT_MODEL_REGISTRY[object.objectType]
      const catalogAsset = object.objectType === 'glb-model' ? getGlbCatalogAsset(object.variant, modelAssets) : null
      const model = catalogAsset
        ? { kind: 'gltf' as const, assetUrl: catalogAsset.url }
        : typeModels?.[object.variant] ?? typeModels?.[definition?.defaultVariant ?? '']
      return <PlacedObject
        key={object.id}
        object={object}
        displayName={typeof object.properties.name === 'string' ? object.properties.name : undefined}
        model={model}
        editable={editable}
        transformEnabled={transformEnabled}
        optionPressed={optionPressed}
        selected={selectedId === object.id}
        placementActive={placementActive}
        isInsideCampus={isInsideCampus}
        transformMode={transformMode}
        onSelect={onSelect}
        onTransformUpdate={onTransformUpdate}
        onTransformStart={onTransformStart}
        onTransformEnd={onTransformEnd}
        onTransformCancel={onTransformCancel}
        onDirectDragStart={onDirectDragStart}
        onDirectDragEnd={onDirectDragEnd}
        onDirectDragCancel={onDirectDragCancel}
      />
    })}
  </group>
}

type PlacedObjectProps = Omit<PlacedObjectsLayerProps, 'objects' | 'selectedId' | 'modelAssets'> & {
  object: SceneObjectRecord
  displayName?: string
  model: (typeof OBJECT_MODEL_REGISTRY)[string][string] | undefined
  selected: boolean
}

function PlacedObject({ object, displayName, model, editable, transformEnabled, optionPressed, selected, placementActive, isInsideCampus, transformMode, onSelect, onTransformUpdate, onTransformStart, onTransformEnd, onTransformCancel, onDirectDragStart, onDirectDragEnd, onDirectDragCancel }: PlacedObjectProps) {
  const objectRef = useRef<THREE.Group>(null!)
  const transformControlsRef = useRef<TransformControlsImpl>(null)
  const transformStartRef = useRef<SceneObjectTransform | null>(null)
  const cancelTransformRef = useRef<() => void>(() => {})
  const dragSessionRef = useRef<{
    pointerId: number
    startClient: { x: number; y: number }
    startPosition: [number, number, number]
    startPlanePoint: { x: number; z: number }
    started: boolean
    previousControlsEnabled: boolean
    finish: (cancelled: boolean) => void
  } | null>(null)
  const { camera, gl } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  const planePoint = useMemo(() => new THREE.Vector3(), [])
  const dragPlane = useMemo(() => new THREE.Plane(), [])

  useEffect(() => {
    const cancelOnBlur = () => cancelTransformRef.current()
    const cancelOnVisibility = () => { if (document.hidden) cancelOnBlur() }
    const cancelOnPointer = (event: PointerEvent) => {
      if (event.type === 'pointercancel') cancelTransformRef.current()
    }
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (!transformStartRef.current) return
      event.preventDefault()
      cancelTransformRef.current()
    }
    window.addEventListener('blur', cancelOnBlur)
    window.addEventListener('keydown', cancelOnEscape)
    document.addEventListener('visibilitychange', cancelOnVisibility)
    gl.domElement.addEventListener('pointercancel', cancelOnPointer)
    return () => {
      window.removeEventListener('blur', cancelOnBlur)
      window.removeEventListener('keydown', cancelOnEscape)
      document.removeEventListener('visibilitychange', cancelOnVisibility)
      gl.domElement.removeEventListener('pointercancel', cancelOnPointer)
      cancelTransformRef.current()
      dragSessionRef.current?.finish(true)
    }
  }, [gl.domElement])

  const getPlanePoint = (clientX: number, clientY: number, y: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, y, 0))
    return raycaster.ray.intersectPlane(dragPlane, planePoint.clone())
  }

  const beginDirectDrag = (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
    if (!editable || !transformEnabled || optionPressed || placementActive || event.nativeEvent.button !== 0) return
    const target = objectRef.current
    const controls = transformControlsRef.current as unknown as { axis: string | null; dragging: boolean; enabled: boolean } | null
    // The gizmo gets first refusal; direct manipulation only starts on the model body.
    if (!target || controls?.dragging || controls?.axis) return
    const native = event.nativeEvent
    const startPoint = native.altKey ? null : event.ray.intersectPlane(
      dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, target.position.y, 0)),
      planePoint.clone(),
    )
    if (!startPoint) return

    event.stopPropagation()
    native.preventDefault()
    onSelect(object.id)
    const startPosition: [number, number, number] = [target.position.x, target.position.y, target.position.z]
    const canvas = gl.domElement
    const session = {
      pointerId: native.pointerId,
      startClient: { x: native.clientX, y: native.clientY },
      startPosition,
      startPlanePoint: { x: startPoint.x, z: startPoint.z },
      started: false,
      previousControlsEnabled: controls?.enabled ?? true,
      finish: (_cancelled: boolean) => {},
    }
    dragSessionRef.current = session
    if (controls) controls.enabled = false
    try { canvas.setPointerCapture(native.pointerId) } catch { /* Window listeners remain the fallback. */ }

    const removeListeners = () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('blur', onBlur)
      try { if (canvas.hasPointerCapture(session.pointerId)) canvas.releasePointerCapture(session.pointerId) } catch { /* Capture may already have been released by the browser. */ }
    }
    const finish = (cancelled: boolean) => {
      if (dragSessionRef.current !== session) return
      dragSessionRef.current = null
      removeListeners()
      const draggedObject = objectRef.current
      if (cancelled && session.started && draggedObject) {
        draggedObject.position.set(...session.startPosition)
        draggedObject.updateMatrixWorld()
        onDirectDragCancel()
      } else if (session.started && draggedObject) {
        onDirectDragEnd(object.id, [draggedObject.position.x, session.startPosition[1], draggedObject.position.z])
      }
      if (controls) controls.enabled = session.previousControlsEnabled
    }
    session.finish = finish

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== session.pointerId) return
      if (!session.started && !hasDirectDragThreshold(session.startClient, { x: moveEvent.clientX, y: moveEvent.clientY })) return
      if (!session.started) {
        if (!onDirectDragStart(object.id)) { finish(true); return }
        session.started = true
      }
      const point = getPlanePoint(moveEvent.clientX, moveEvent.clientY, session.startPosition[1])
      if (!point) return
      const position = positionFromGroundDrag(session.startPosition, session.startPlanePoint, point)
      if (!isInsideCampus(position[0], position[2])) return
      target.position.set(position[0], session.startPosition[1], position[2])
      target.updateMatrixWorld()
      moveEvent.preventDefault()
    }
    const onUp = (upEvent: PointerEvent) => { if (upEvent.pointerId === session.pointerId) finish(false) }
    const onCancel = (cancelEvent: PointerEvent) => { if (cancelEvent.pointerId === session.pointerId) finish(true) }
    const onBlur = () => finish(false)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('blur', onBlur)
  }

  const readTransform = (): SceneObjectTransform | null => {
    const target = objectRef.current
    if (!target) return null
    return {
      position: [target.position.x, target.position.y, target.position.z],
      rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
      scale: [target.scale.x, target.scale.y, target.scale.z],
    }
  }

  const beginTransform = () => {
    if (transformStartRef.current) return
    const initial = readTransform()
    if (!initial) return
    transformStartRef.current = initial
    onTransformStart()
  }

  const finishTransform = () => {
    const initial = transformStartRef.current
    const final = readTransform()
    if (!initial || !final) return
    transformStartRef.current = null
    const changed = (['position', 'rotation', 'scale'] as const).some((field) =>
      initial[field].some((value, index) => Math.abs(value - final[field][index]) > 1e-9),
    )
    try {
      if (changed) onTransformUpdate(object.id, final)
      onTransformEnd()
    } catch {
      targetRestore(initial)
      onTransformCancel()
    }
  }

  const cancelTransform = () => {
    const initial = transformStartRef.current
    const target = objectRef.current
    if (!initial) return
    transformStartRef.current = null
    if (target) targetRestore(initial)
    onTransformCancel()

    // End TransformControls' owner-document pointer session after clearing our
    // snapshot, so its mouseUp event cannot commit the canceled transform.
    const pointerUp = typeof PointerEvent === 'undefined'
      ? Object.assign(new Event('pointerup'), { button: 0, clientX: 0, clientY: 0 }) as PointerEvent
      : new PointerEvent('pointerup', { button: 0 })
    gl.domElement.ownerDocument.dispatchEvent(pointerUp)
  }

  cancelTransformRef.current = cancelTransform

  const targetRestore = (transform: SceneObjectTransform) => {
    const target = objectRef.current
    if (!target) return
    target.position.set(...transform.position)
    target.rotation.set(...transform.rotation)
    target.scale.set(...transform.scale)
    target.updateMatrixWorld()
  }

  const updateTransform = () => {
    const target = objectRef.current
    if (!target) return
    target.position.y = Math.max(0, target.position.y)
    target.scale.set(Math.max(0.05, target.scale.x), Math.max(0.05, target.scale.y), Math.max(0.05, target.scale.z))
  }

  return <>
    <group
      ref={objectRef}
      position={object.transform.position}
      rotation={object.transform.rotation}
      scale={object.transform.scale}
      name={displayName ?? object.objectType}
      userData={{ sceneObjectId: object.id, objectType: object.objectType, variant: object.variant }}
      onPointerDown={beginDirectDrag}
      onClick={editable ? (event) => {
        event.stopPropagation()
        if (!event.nativeEvent.altKey) onSelect(object.id)
      } : undefined}
    >
      {!model ? <UnavailableModel /> : model.kind === 'gltf'
        ? <GlbAssetErrorBoundary key={model.assetUrl} fallback={<UnavailableModel />}><Suspense fallback={<UnavailableModel />}><GLBObjectModel assetUrl={model.assetUrl} /></Suspense></GlbAssetErrorBoundary>
        : <model.component properties={object.properties} />}
    </group>
    {editable && transformEnabled && !optionPressed && selected && !placementActive && <TransformControls
      object={objectRef}
      mode={transformMode}
      axis={transformMode === 'rotate' ? 'Y' : undefined}
      size={1.25}
      ref={transformControlsRef}
      onMouseDown={beginTransform}
      onMouseUp={finishTransform}
      onObjectChange={updateTransform}
    />}
  </>
}
