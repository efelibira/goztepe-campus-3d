import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'

export default function GLBObjectModel({ assetUrl }: { assetUrl: string }) {
  const { scene } = useGLTF(assetUrl)
  const instance = useMemo(() => scene.clone(true), [scene])
  return <primitive object={instance} />
}
