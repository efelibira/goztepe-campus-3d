import { Component, Suspense, lazy, useMemo } from 'react'
import type { ReactNode } from 'react'
import * as THREE from 'three'
import { geometryToShapes } from '../data/geoJsonToShape.js'
import { projectPosition } from '../data/projectCoordinates.js'
import type { ResolvedBuilding } from '../types/campus'
import { PALETTE } from '../scene/palette'
import type { GlbCatalogAsset } from '../data/modelCatalog'
import { getGlbCatalogAsset } from '../data/modelCatalog.js'

const GLBObjectModel = lazy(() => import('./GLBObjectModel'))

type Props = {
  building: ResolvedBuilding
  selected: boolean
  interactive?: boolean
  modelAssets: Record<string, GlbCatalogAsset>
  onSelect: (id: string) => void
}

type BuildingModelErrorBoundaryProps = { fallback: ReactNode; children: ReactNode }
class BuildingModelErrorBoundary extends Component<BuildingModelErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function AutomaticBuildingModel({ building, geometries, selected, pickOnly = false }: {
  building: ResolvedBuilding
  geometries: THREE.ExtrudeGeometry[]
  selected: boolean
  pickOnly?: boolean
}) {
  const facade = selected ? PALETTE.accent : building.color ?? PALETTE.building
  const roof = selected ? PALETTE.accent : building.roofColor ?? facade
  return <group rotation={[-Math.PI / 2, 0, 0]}>
    {geometries.map((geometry, index) => <mesh key={`${building.id}-${index}`} geometry={geometry} castShadow={!pickOnly} receiveShadow={!pickOnly}>
      {pickOnly
        ? <meshBasicMaterial colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
        : <>
          <meshStandardMaterial attach="material-0" color={facade} roughness={0.84} metalness={0} />
          <meshStandardMaterial attach="material-1" color={roof} roughness={0.84} metalness={0} />
        </>}
    </mesh>)}
  </group>
}

export default function BuildingMesh({ building, selected, interactive = true, modelAssets, onSelect }: Props) {
  const { geometries, footprintCenter } = useMemo(() => {
    const shapes = geometryToShapes(building.feature.geometry, projectPosition)
    const result = shapes.map((shape) => new THREE.ExtrudeGeometry(shape, {
      depth: building.heightMeters,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    }))
    const bounds = new THREE.Box3()
    for (const geometry of result) {
      geometry.computeBoundingBox()
      if (geometry.boundingBox) bounds.union(geometry.boundingBox)
    }
    const center = bounds.getCenter(new THREE.Vector3())
    return { geometries: result, footprintCenter: [center.x, center.y] as [number, number] }
  }, [building.feature.geometry, building.heightMeters])
  const model = building.model
  const glbUrl = model ? getGlbCatalogAsset(model.assetId, modelAssets)?.url ?? null : null
  const fallback = <AutomaticBuildingModel building={building} geometries={geometries} selected={selected} />

  return (
    <group
      onPointerDown={interactive ? (event) => event.stopPropagation() : undefined}
      onClick={interactive ? (event) => {
        event.stopPropagation()
        onSelect(building.id)
      } : undefined}
    >
      {!building.visible
        ? <AutomaticBuildingModel building={building} geometries={geometries} selected={selected} pickOnly />
        : model && glbUrl
          ? <BuildingModelErrorBoundary key={`${building.id}:${model.assetId}`} fallback={fallback}>
            <Suspense fallback={fallback}>
              <group
                position={[
                  footprintCenter[0] + model.offset[0],
                  model.offset[1],
                  -footprintCenter[1] + model.offset[2],
                ]}
                rotation={model.rotation}
                scale={model.scale}
              >
                <GLBObjectModel assetUrl={glbUrl} />
              </group>
            </Suspense>
          </BuildingModelErrorBoundary>
          : fallback}
    </group>
  )
}
