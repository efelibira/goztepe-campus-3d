import { useMemo } from 'react'
import * as THREE from 'three'
import { geometryToShapes } from '../data/geoJsonToShape.js'
import { projectPosition } from '../data/projectCoordinates.js'
import { createCampusContainment } from '../data/campusBoundary.js'
import { walkwayToShape } from '../data/walkways.js'
import { PALETTE } from './palette'
import { CAMPUS_GROUND_SIZE } from './cameraConfig.js'
import type { CampusData, ResolvedBuilding } from '../types/campus'
import BuildingMesh from '../components/BuildingMesh'
import PlacedObjectsLayer from '../components/PlacedObjectsLayer'
import PlacementSurface from '../components/PlacementSurface'
import type { SceneObjectRecord } from '../editor/sceneDocument'
import type { EditorControlMode } from '../editor/orbitMouseBindings.js'
import type { GlbCatalogAsset } from '../data/modelCatalog'

const GROUND_SIZE = CAMPUS_GROUND_SIZE

type Props = {
  data: CampusData
  buildings: ResolvedBuilding[]
  selectedId: string | null
  sceneObjects: SceneObjectRecord[]
  modelAssets: Record<string, GlbCatalogAsset>
  editMode: boolean
  controlMode: EditorControlMode
  optionPressed: boolean
  placementActive: boolean
  selectedObjectId: string | null
  transformMode: 'translate' | 'rotate' | 'scale'
  onSelect: (id: string) => void
  onClearSelection: () => void
  onSelectObject: (id: string) => void
  onPlaceObject: (position: [number, number, number]) => void
  onTransformUpdate: (id: string, transform: SceneObjectRecord['transform']) => void
  onTransformStart: () => void
  onTransformEnd: () => void
  onTransformCancel: () => void
  onDirectDragStart: (id: string) => boolean
  onDirectDragEnd: (id: string, position: [number, number, number]) => void
  onDirectDragCancel: () => void
}

function Ground({ data }: { data: CampusData }) {
  const geometry = useMemo(() => {
    const feature = data.boundary.features[0]
    if (!feature) throw new Error('Kampüs sınırı boş.')
    const shape = geometryToShapes(feature.geometry, projectPosition)[0]
    const result = new THREE.ShapeGeometry(shape)
    result.computeVertexNormals()
    return result
  }, [data.boundary])

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color={PALETTE.outside} roughness={1} />
      </mesh>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} receiveShadow>
        <meshStandardMaterial color={PALETTE.campus} roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

function Walkways({ data }: { data: CampusData }) {
  const geometries = useMemo(() => data.walkways.features.filter((feature) => feature.properties.visible !== false).map((feature) => {
    const shape = walkwayToShape(feature.geometry.coordinates as [number, number][], Number(feature.properties.widthMeters))
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.computeVertexNormals()
    return { geometry, feature }
  }), [data.walkways])

  return <group rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
    {geometries.map(({ geometry, feature }, index) => <mesh key={feature.properties.segmentId ?? index} geometry={geometry} receiveShadow renderOrder={index + 1}>
      <meshStandardMaterial color={feature.properties.displayColor ?? PALETTE.walkway} roughness={1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>)}
  </group>
}

export default function CampusScene({
  data, buildings, selectedId, sceneObjects, modelAssets, editMode, controlMode, optionPressed, placementActive, selectedObjectId, transformMode,
  onSelect, onClearSelection, onSelectObject, onPlaceObject, onTransformUpdate, onTransformStart, onTransformEnd,
  onTransformCancel, onDirectDragStart, onDirectDragEnd, onDirectDragCancel,
}: Props) {
  const boundary = data.boundary.features[0].geometry
  const isInsideCampus = useMemo(() => createCampusContainment(boundary), [boundary])
  return (
    <>
      <color attach="background" args={[PALETTE.background]} />
      <hemisphereLight args={['#fffaf0', '#a9a9b4', 1.2]} />
      <ambientLight intensity={0.38} />
      <directionalLight
        castShadow
        position={[-220, 340, 180]}
        intensity={1.65}
        color="#fff7e8"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-420}
        shadow-camera-right={420}
        shadow-camera-top={420}
        shadow-camera-bottom={-420}
        shadow-bias={-0.0002}
      />
      <Ground data={data} />
      <Walkways data={data} />
      <PlacementSurface active={editMode && placementActive} boundary={boundary} onPlace={onPlaceObject} />
      <group onPointerMissed={onClearSelection}>
        {buildings.map((building) => (
          <BuildingMesh
            key={building.id}
            building={building}
            modelAssets={modelAssets}
            selected={selectedId === building.id}
            interactive
            onSelect={onSelect}
          />
        ))}
      </group>
      <PlacedObjectsLayer
        objects={sceneObjects}
        modelAssets={modelAssets}
        editable={editMode}
        transformEnabled={controlMode === 'object'}
        optionPressed={optionPressed}
        selectedId={selectedObjectId}
        placementActive={placementActive}
        isInsideCampus={isInsideCampus}
        transformMode={transformMode}
        onSelect={onSelectObject}
        onTransformUpdate={onTransformUpdate}
        onTransformStart={onTransformStart}
        onTransformEnd={onTransformEnd}
        onTransformCancel={onTransformCancel}
        onDirectDragStart={onDirectDragStart}
        onDirectDragEnd={onDirectDragEnd}
        onDirectDragCancel={onDirectDragCancel}
      />
      <gridHelper args={[GROUND_SIZE, 30, '#aaaabd', '#d5cfc2']} position={[0, -0.3, 0]} />
    </>
  )
}
