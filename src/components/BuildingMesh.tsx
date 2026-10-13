import { useMemo } from 'react'
import * as THREE from 'three'
import { geometryToShapes } from '../data/geoJsonToShape.js'
import { projectPosition } from '../data/projectCoordinates.js'
import type { ResolvedBuilding } from '../types/campus'
import { PALETTE } from '../scene/palette'

type Props = {
  building: ResolvedBuilding
  selected: boolean
  onSelect: (id: string) => void
}

export default function BuildingMesh({ building, selected, onSelect }: Props) {
  const geometries = useMemo(() => {
    const shapes = geometryToShapes(building.feature.geometry, projectPosition)
    return shapes.map((shape) => new THREE.ExtrudeGeometry(shape, {
      depth: building.heightMeters,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    }))
  }, [building.feature.geometry, building.heightMeters])

  return (
    <group
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(building.id)
      }}
    >
      {geometries.map((geometry, index) => (
        <mesh key={`${building.id}-${index}`} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={selected ? PALETTE.accent : building.color ?? PALETTE.building}
            roughness={0.84}
            metalness={0}
          />
        </mesh>
      ))}
    </group>
  )
}
