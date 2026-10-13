import { useEffect, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { BuildingEditOverride, ResolvedBuilding } from '../types/campus'
import type { BuildingModelOverride } from '../types/campus'
import type { GlbCatalogAsset } from '../data/modelCatalog'
import { PALETTE } from '../scene/palette'

type EditableField = keyof BuildingEditOverride
type Props = {
  building: ResolvedBuilding
  defaults: ResolvedBuilding
  override?: BuildingEditOverride
  models: GlbCatalogAsset[]
  onUpdate: (patch: Partial<BuildingEditOverride>) => void
  onReset: (field: EditableField) => void
}

function ModelVectorEditor({
  label, value, field, onCommit,
}: {
  label: string
  value: [number, number, number]
  field: 'offset' | 'rotation' | 'scale'
  onCommit: (field: 'offset' | 'rotation' | 'scale', index: number, value: string) => void
}) {
  const display = field === 'rotation' ? value.map((entry) => entry * 180 / Math.PI) : value
  const [drafts, setDrafts] = useState(display.map((entry) => entry.toFixed(2)))
  useEffect(() => setDrafts(display.map((entry) => entry.toFixed(2))), [field, value[0], value[1], value[2]])
  const axis = ['X', 'Y', 'Z']
  return <fieldset className="building-model-vector">
    <legend>{label}</legend>
    <div>
      {axis.map((name, index) => <label key={name}>
        <span>{name}</span>
        <input
          type="number"
          inputMode="decimal"
          step={field === 'scale' ? '0.01' : '0.1'}
          min={field === 'scale' ? '0.01' : undefined}
          value={drafts[index]}
          onChange={(event) => setDrafts((current) => current.map((entry, i) => i === index ? event.target.value : entry))}
          onBlur={() => {
            onCommit(field, index, drafts[index])
            const number = Number(drafts[index])
            if (!Number.isFinite(number) || (field === 'scale' && number <= 0)) {
              setDrafts(value.map((entry) => (field === 'rotation' ? entry * 180 / Math.PI : entry).toFixed(2)))
            }
          }}
        />
      </label>)}
    </div>
  </fieldset>
}

export default function BuildingEditPanel({ building, defaults, override, models, onUpdate, onReset }: Props) {
  const [nameDraft, setNameDraft] = useState(building.name)
  const [heightDraft, setHeightDraft] = useState(String(building.heightMeters))
  const [heightError, setHeightError] = useState('')

  useEffect(() => {
    setNameDraft(building.name)
    setHeightDraft(String(building.heightMeters))
    setHeightError('')
  }, [building.id, building.name, building.heightMeters])

  const hasOverride = (field: EditableField) => Boolean(override && Object.hasOwn(override, field))
  const resetButton = (field: EditableField, label = 'Varsayılan') => <button
    type="button"
    className="reset-building-field"
    onClick={() => onReset(field)}
    disabled={!hasOverride(field)}
    aria-label={`${label} değerine dön`}
  >Sıfırla</button>

  const commitName = () => {
    const name = nameDraft.trim()
    if (!name) {
      setNameDraft(building.name)
      return
    }
    if (name !== building.name) onUpdate({ name })
  }

  const commitHeight = () => {
    const height = Number(heightDraft)
    if (!heightDraft.trim() || !Number.isFinite(height) || height <= 0) {
      setHeightError('Pozitif ve sonlu bir metre değeri girin.')
      setHeightDraft(String(building.heightMeters))
      return
    }
    setHeightError('')
    if (height !== building.heightMeters) onUpdate({ heightMeters: height })
  }

  const onTextKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
    }
    if (event.key === 'Escape') {
      event.stopPropagation()
      setNameDraft(building.name)
      setHeightDraft(String(building.heightMeters))
      setHeightError('')
      event.currentTarget.blur()
    }
  }

  const facadeColor = building.color ?? defaults.color ?? PALETTE.building
  const roofColor = building.roofColor ?? defaults.roofColor ?? defaults.color ?? PALETTE.building
  const model = override?.model

  const patchModel = (patch: Partial<BuildingModelOverride>) => {
    if (!model) return
    onUpdate({ model: { ...model, ...patch } })
  }

  const selectModel = (assetId: string) => {
    if (!assetId) {
      onReset('model')
      return
    }
    onUpdate({ model: {
      type: 'glb',
      assetId,
      scale: model?.scale ?? [1, 1, 1],
      rotation: model?.rotation ?? [0, 0, 0],
      offset: model?.offset ?? [0, 0, 0],
    } })
  }

  const commitModelVector = (field: 'offset' | 'rotation' | 'scale', index: number, rawValue: string) => {
    if (!model) return
    const value = Number(rawValue)
    if (!rawValue.trim() || !Number.isFinite(value) || (field === 'scale' && value <= 0)) return
    const next = [...model[field]] as [number, number, number]
    next[index] = field === 'rotation' ? value * Math.PI / 180 : value
    patchModel({ [field]: next })
  }

  return <section className="building-edit-panel" aria-label="Kaynak bina düzenleme">
    <div className="building-edit-heading">
      <strong>Kaynak bina</strong>
      <small>{building.id}</small>
      <small className="building-edit-height-confidence">Mevcut yükseklik: {building.heightLabel} · {building.confidenceLabel}</small>
    </div>
    <label className="building-edit-field">
      <span>Görünen ad</span>
      <input
        type="text"
        value={nameDraft}
        onChange={(event) => setNameDraft(event.target.value)}
        onBlur={commitName}
        onKeyDown={onTextKeyDown}
      />
      {resetButton('name')}
    </label>
    <label className="building-edit-field">
      <span>Yükseklik (m)</span>
      <input
        type="number"
        inputMode="decimal"
        min="0.1"
        step="0.1"
        value={heightDraft}
        aria-invalid={Boolean(heightError)}
        onChange={(event) => setHeightDraft(event.target.value)}
        onBlur={commitHeight}
        onKeyDown={onTextKeyDown}
      />
      {resetButton('heightMeters')}
      {heightError && <small className="building-edit-error">{heightError}</small>}
    </label>
    <label className="building-edit-field color-field">
      <span>Cephe rengi</span>
      <input type="color" value={facadeColor} onChange={(event) => onUpdate({ facadeColor: event.target.value })} />
      {resetButton('facadeColor')}
    </label>
    <label className="building-edit-field color-field">
      <span>Çatı rengi</span>
      <input type="color" value={roofColor} onChange={(event) => onUpdate({ roofColor: event.target.value })} />
      {resetButton('roofColor')}
    </label>
    <label className="building-edit-visibility">
      <input type="checkbox" checked={building.visible} onChange={(event) => onUpdate({ visible: event.target.checked })} />
      <span>Binayı görünür tut</span>
      {resetButton('visible')}
    </label>
    <section className="building-model-assignment" aria-label="Bina GLB modeli">
      <label className="building-edit-field">
        <span>Model kaynağı</span>
        <select value={model?.assetId ?? ''} onChange={(event) => selectModel(event.target.value)}>
          <option value="">Otomatik GeoJSON</option>
          {model && !models.some((asset) => asset.id === model.assetId) && <option value={model.assetId}>Katalogda bulunamadı: {model.assetId}</option>}
          {models.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
        {resetButton('model')}
      </label>
      {model && <>
        <small className="building-model-asset-id">GLB varlık kimliği: {model.assetId}</small>
        <ModelVectorEditor label="Konum düzeltmesi (m)" value={model.offset} field="offset" onCommit={commitModelVector} />
        <ModelVectorEditor label="Dönüş (derece)" value={model.rotation} field="rotation" onCommit={commitModelVector} />
        <ModelVectorEditor label="Ölçek" value={model.scale} field="scale" onCommit={commitModelVector} />
      </>}
      {!models.length && <small className="building-edit-note">GLB eklemek için yerel geliştirme ortamındaki Model İçe Aktar alanını kullanın.</small>}
    </section>
    <p className="building-edit-note">Yükseklik düzenlemesi ölçüm kaynağını değiştirmez; doğrulanmamış değerler tahmin olarak kalır.</p>
  </section>
}
