import { useMemo } from 'react'
import * as THREE from 'three'
import { geometryToShapes } from '../data/geoJsonToShape.js'
import { projectPosition } from '../data/projectCoordinates.js'
import type { CampusData, ResolvedBuilding } from '../types/campus'
import BuildingMesh from '../components/BuildingMesh'

const GROUND_SIZE = 900

type Props = {
  data: CampusData
  buildings: ResolvedBuilding[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClearSelection: () => void
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
        <meshStandardMaterial color="#e6e9dc" roughness={1} />
      </mesh>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, 0]} receiveShadow>
        <meshStandardMaterial color="#dce7d4" roughness={1} side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

export default function CampusScene({ data, buildings, selectedId, onSelect, onClearSelection }: Props) {
  return (
    <>
      <color attach="background" args={['#edf0e9']} />
      <hemisphereLight args={['#fff7e8', '#a6b7a2', 1.45]} />
      <ambientLight intensity={0.48} />
      <directionalLight
        castShadow
        position={[-220, 340, 180]}
        intensity={2.1}
        color="#fff0d5"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-420}
        shadow-camera-right={420}
        shadow-camera-top={420}
        shadow-camera-bottom={-420}
        shadow-bias={-0.0002}
      />
      <Ground data={data} />
      <group onPointerMissed={onClearSelection}>
        {buildings.map((building) => (
          <BuildingMesh
            key={building.id}
            building={building}
            selected={selectedId === building.id}
            onSelect={onSelect}
          />
        ))}
      </group>
      <gridHelper args={[GROUND_SIZE, 30, '#d4dbd1', '#e0e4dc']} position={[0, -0.3, 0]} />
    </>
  )
}
