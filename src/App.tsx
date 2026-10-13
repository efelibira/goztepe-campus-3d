import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useState } from 'react'
import CampusScene from './scene/CampusScene'
import { loadCampusData } from './data/loadCampusData'
import { resolveBuilding } from './data/resolveBuilding'
import type { CampusData, ResolvedBuilding } from './types/campus'
import { CAMERA_CONFIG, CAMERA_DISTANCE_LIMITS } from './scene/cameraConfig.js'

export default function App() {
  const [data, setData] = useState<CampusData | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')

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

  return (
    <main className="app-shell">
      <Canvas
        className="campus-canvas"
        shadows
        dpr={[1, 1.75]}
        camera={CAMERA_CONFIG}
        onPointerMissed={() => setSelectedId(null)}
      >
        <Suspense fallback={null}>
          {data && (
            <CampusScene
              data={data}
              buildings={buildings}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClearSelection={() => setSelectedId(null)}
            />
          )}
        </Suspense>
        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
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

      <aside className="help-card">
        <strong>Gezinme</strong>
        <span>Sürükle: döndür</span>
        <span>Kaydır: yakınlaş</span>
        <span>Sağ tuşla sürükle: taşı</span>
      </aside>

      {selected && (
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
