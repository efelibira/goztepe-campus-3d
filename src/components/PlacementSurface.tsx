import { useMemo } from 'react'
import * as THREE from 'three'
import { CAMPUS_GROUND_SIZE } from '../scene/cameraConfig.js'
import { createCampusContainment } from '../data/campusBoundary.js'
import type { CampusGeometry } from '../types/campus'

type Props = {
  active: boolean
  boundary: CampusGeometry
  onPlace: (position: [number, number, number]) => void
}

export default function PlacementSurface({ active, boundary, onPlace }: Props) {
  const pointInsideCampus = useMemo(() => createCampusContainment(boundary), [boundary])
  return <mesh
    visible={active}
    rotation={[-Math.PI / 2, 0, 0]}
    onPointerDown={(event) => {
      if (!active || event.button !== 0 || event.nativeEvent.altKey || !pointInsideCampus(event.point.x, event.point.z)) return
      event.stopPropagation()
      onPlace([event.point.x, 0, event.point.z])
    }}
  >
    <planeGeometry args={[CAMPUS_GROUND_SIZE, CAMPUS_GROUND_SIZE]} />
    <meshBasicMaterial color="#ffffff" colorWrite={false} depthWrite={false} side={THREE.DoubleSide} />
  </mesh>
}
