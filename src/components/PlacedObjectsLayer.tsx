import { lazy, Suspense } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { TransformControls } from '@react-three/drei'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { useThree } from '@react-three/fiber'
import { OBJECT_MODEL_REGISTRY } from './ObjectModels'
import type { SceneObjectRecord, SceneObjectTransform } from '../editor/sceneDocument'
import { getObjectTypeDefinition } from '../editor/objectCatalog.js'
import { hasDirectDragThreshold, positionFromGroundDrag } from '../editor/groundPlaneDrag.js'

function UnavailableModel() {
  return <mesh position={[0, 0.5, 0]}>
    <boxGeometry args={[1, 1, 1]} />
    <meshStandardMaterial color="#D9B9B2" wireframe />
  </mesh>
}

const GLBObjectModel = lazy(() => import('./GLBObjectModel'))

export type PlacedObjectsLayerProps = {
  objects: SceneObjectRecord[]
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
  onDirectDragStart: (id: string) => boolean
  onDirectDragEnd: (id: string, position: [number, number, number]) => void
  onDirectDragCancel: () => void
}

export default function PlacedObjectsLayer({
  objects, editable, transformEnabled, optionPressed, selectedId, placementActive, isInsideCampus, transformMode,
  onSelect, onTransformUpdate, onTransformStart, onTransformEnd, onDirectDragStart, onDirectDragEnd, onDirectDragCancel,
}: PlacedObjectsLayerProps) {
  return <group>
    {objects.map((object) => {
      const definition = getObjectTypeDefinition(object.objectType)
      const typeModels = OBJECT_MODEL_REGISTRY[object.objectType]
      const model = typeModels?.[object.variant] ?? typeModels?.[definition?.defaultVariant ?? '']
      return <PlacedObject
        key={object.id}
        object={object}
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
        onDirectDragStart={onDirectDragStart}
        onDirectDragEnd={onDirectDragEnd}
        onDirectDragCancel={onDirectDragCancel}
      />
    })}
  </group>
}

type PlacedObjectProps = Omit<PlacedObjectsLayerProps, 'objects' | 'selectedId'> & {
  object: SceneObjectRecord
  model: (typeof OBJECT_MODEL_REGISTRY)[string][string] | undefined
  selected: boolean
}

function PlacedObject({ object, model, editable, transformEnabled, optionPressed, selected, placementActive, isInsideCampus, transformMode, onSelect, onTransformUpdate, onTransformStart, onTransformEnd, onDirectDragStart, onDirectDragEnd, onDirectDragCancel }: PlacedObjectProps) {
  const objectRef = useRef<THREE.Group>(null!)
  const transformControlsRef = useRef<TransformControlsImpl>(null)
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

  useEffect(() => () => { dragSessionRef.current?.finish(true) }, [])

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

  const updateTransform = () => {
    const target = objectRef.current
    if (!target) return
    target.position.y = Math.max(0, target.position.y)
    target.scale.set(Math.max(0.05, target.scale.x), Math.max(0.05, target.scale.y), Math.max(0.05, target.scale.z))
    onTransformUpdate(object.id, {
      position: [target.position.x, target.position.y, target.position.z],
      rotation: [target.rotation.x, target.rotation.y, target.rotation.z],
      scale: [target.scale.x, target.scale.y, target.scale.z],
    })
  }

  return <>
    <group
      ref={objectRef}
      position={object.transform.position}
      rotation={object.transform.rotation}
      scale={object.transform.scale}
      userData={{ sceneObjectId: object.id, objectType: object.objectType, variant: object.variant }}
      onPointerDown={beginDirectDrag}
      onClick={editable ? (event) => {
        event.stopPropagation()
        if (!event.nativeEvent.altKey) onSelect(object.id)
      } : undefined}
    >
      {!model ? <UnavailableModel /> : model.kind === 'gltf'
        ? <Suspense fallback={<UnavailableModel />}><GLBObjectModel assetUrl={model.assetUrl} /></Suspense>
        : <model.component properties={object.properties} />}
    </group>
    {editable && transformEnabled && !optionPressed && selected && !placementActive && <TransformControls
      object={objectRef}
      mode={transformMode}
      axis={transformMode === 'rotate' ? 'Y' : undefined}
      size={1.25}
      ref={transformControlsRef}
      onMouseDown={onTransformStart}
      onMouseUp={onTransformEnd}
      onObjectChange={updateTransform}
    />}
  </>
}
