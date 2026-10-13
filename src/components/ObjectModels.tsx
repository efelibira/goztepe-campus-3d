import type { ComponentType } from 'react'

export type ProceduralModelProps = { properties: Record<string, unknown> }

function numberProperty(properties: Record<string, unknown>, key: string, fallback: number) {
  const value = properties[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function colorProperty(properties: Record<string, unknown>, fallback: string) {
  return typeof properties.color === 'string' ? properties.color : fallback
}

export function RectangularBuildingModel({ properties }: ProceduralModelProps) {
  const width = numberProperty(properties, 'width', 12)
  const depth = numberProperty(properties, 'depth', 9)
  const height = numberProperty(properties, 'height', 5)
  return <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
    <boxGeometry args={[width, height, depth]} />
    <meshStandardMaterial color={colorProperty(properties, '#98A1BC')} roughness={0.86} />
  </mesh>
}

export function StylizedTreeModel({ properties }: ProceduralModelProps) {
  const height = numberProperty(properties, 'height', 6)
  const canopyRadius = numberProperty(properties, 'canopyRadius', 1.8)
  const trunkRadius = numberProperty(properties, 'trunkRadius', 0.22)
  const trunkHeight = height * 0.48
  return <group>
    <mesh position={[0, trunkHeight / 2, 0]} castShadow>
      <cylinderGeometry args={[trunkRadius * 0.78, trunkRadius, trunkHeight, 7]} />
      <meshStandardMaterial color="#9B8067" roughness={1} />
    </mesh>
    <mesh position={[0, trunkHeight + canopyRadius * 0.72, 0]} castShadow>
      <icosahedronGeometry args={[canopyRadius, 1]} />
      <meshStandardMaterial color={colorProperty(properties, '#A8B99A')} roughness={1} flatShading />
    </mesh>
  </group>
}

export function BenchModel({ properties }: ProceduralModelProps) {
  const length = numberProperty(properties, 'length', 1.8)
  const wood = colorProperty(properties, '#B99B7A')
  return <group>
    {[0, 0.18, 0.36].map((z) => <mesh key={`seat-${z}`} position={[0, 0.46, z - 0.18]} castShadow>
      <boxGeometry args={[length, 0.07, 0.12]} />
      <meshStandardMaterial color={wood} roughness={0.9} />
    </mesh>)}
    {[-length * 0.36, length * 0.36].map((x) => <group key={x}>
      <mesh position={[x, 0.22, 0]} castShadow><boxGeometry args={[0.09, 0.44, 0.42]} /><meshStandardMaterial color="#686A7F" roughness={0.8} /></mesh>
      <mesh position={[x, 0.78, -0.16]} rotation={[-0.12, 0, 0]} castShadow><boxGeometry args={[0.09, 0.58, 0.09]} /><meshStandardMaterial color="#686A7F" roughness={0.8} /></mesh>
    </group>)}
    <mesh position={[0, 0.77, -0.2]} castShadow><boxGeometry args={[length, 0.11, 0.08]} /><meshStandardMaterial color={wood} roughness={0.9} /></mesh>
  </group>
}

export function GazeboModel({ properties }: ProceduralModelProps) {
  const width = numberProperty(properties, 'width', 4)
  const depth = numberProperty(properties, 'depth', 4)
  const height = numberProperty(properties, 'height', 3.2)
  const postX = width * 0.42, postZ = depth * 0.42
  return <group>
    {[-postX, postX].flatMap((x) => [-postZ, postZ].map((z) => <mesh key={`${x}:${z}`} position={[x, height / 2, z]} castShadow receiveShadow>
      <boxGeometry args={[0.16, height, 0.16]} /><meshStandardMaterial color="#9A8A76" roughness={0.9} />
    </mesh>))}
    <mesh position={[0, height * 0.65, 0]} castShadow>
      <boxGeometry args={[width, 0.16, depth]} /><meshStandardMaterial color={colorProperty(properties, '#D6C4A8')} roughness={0.9} />
    </mesh>
    <mesh position={[0, height * 0.84, 0]} castShadow>
      <coneGeometry args={[Math.max(width, depth) * 0.68, height * 0.34, 4]} />
      <meshStandardMaterial color={colorProperty(properties, '#D6C4A8')} roughness={0.9} />
    </mesh>
  </group>
}

export type ObjectModelDefinition =
  | { kind: 'procedural'; component: ComponentType<ProceduralModelProps> }
  | { kind: 'gltf'; assetUrl: string }

export const OBJECT_MODEL_REGISTRY: Readonly<Record<string, Readonly<Record<string, ObjectModelDefinition>>>> = {
  'rectangular-building': { 'pastel-block': { kind: 'procedural', component: RectangularBuildingModel } },
  tree: { 'round-canopy': { kind: 'procedural', component: StylizedTreeModel } },
  bench: { 'wood-slats': { kind: 'procedural', component: BenchModel } },
  gazebo: { 'open-square': { kind: 'procedural', component: GazeboModel } },
}
