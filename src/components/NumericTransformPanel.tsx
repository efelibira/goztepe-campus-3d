import { useEffect, useState } from 'react'
import type { SceneObjectTransform } from '../editor/sceneDocument'
import { formatTransformInput } from '../editor/numericTransform.js'

type Field = 'position' | 'rotation' | 'scale'
type Props = {
  transform: SceneObjectTransform
  disabled?: boolean
  onCommit: (field: Field, index: number, value: string) => string | null
}

const FIELDS: { key: Field; label: string; unit: string; step: string; min?: string }[] = [
  { key: 'position', label: 'Konum', unit: 'm', step: '0.1' },
  { key: 'rotation', label: 'Dönüş', unit: '°', step: '1' },
  { key: 'scale', label: 'Ölçek', unit: '', step: '0.05', min: '0.05' },
]
const AXES = ['X', 'Y', 'Z'] as const

export default function NumericTransformPanel({ transform, disabled = false, onCommit }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const next: Record<string, string> = {}
    for (const { key } of FIELDS) AXES.forEach((_, index) => { next[`${key}.${index}`] = formatTransformInput(transform, key, index) })
    setDrafts(next)
    setErrors({})
  }, [transform])

  const fieldId = (field: Field, index: number) => `${field}.${index}`
  const commit = (field: Field, index: number) => {
    const id = fieldId(field, index)
    const message = onCommit(field, index, drafts[id] ?? '')
    if (message) {
      setErrors((current) => ({ ...current, [id]: message }))
      setDrafts((current) => ({ ...current, [id]: formatTransformInput(transform, field, index) }))
      return
    }
    setErrors((current) => ({ ...current, [id]: '' }))
    const numericValue = Number(drafts[id])
    if (Number.isFinite(numericValue)) {
      setDrafts((current) => ({ ...current, [id]: numericValue.toFixed(2) }))
    }
  }

  return <div className="numeric-transform-panel" aria-label="Sayısal nesne dönüşümü">
    {FIELDS.map(({ key, label, unit, step, min }) => <fieldset className="numeric-transform-row" key={key}>
      <legend>{label}{unit ? ` (${unit})` : ''}</legend>
      {AXES.map((axis, index) => {
        const id = fieldId(key, index)
        return <label className="numeric-transform-field" key={axis}>
          <span>{axis}</span>
          <input
            aria-label={`${label} ${axis}${unit ? ` (${unit})` : ''}`}
            aria-invalid={Boolean(errors[id])}
            type="number"
            inputMode="decimal"
            step={step}
            min={min}
            value={drafts[id] ?? formatTransformInput(transform, key, index)}
            disabled={disabled}
            onChange={(event) => setDrafts((current) => ({ ...current, [id]: event.target.value }))}
            onBlur={() => commit(key, index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); commit(key, index); event.currentTarget.blur() }
              if (event.key === 'Escape') { setDrafts((current) => ({ ...current, [id]: formatTransformInput(transform, key, index) })); event.currentTarget.blur() }
            }}
            onWheel={(event) => event.currentTarget.blur()}
          />
          {errors[id] && <small className="numeric-field-error">{errors[id]}</small>}
        </label>
      })}
    </fieldset>)}
    <small className="numeric-panel-hint">Dönüş değerleri derece olarak girilir. Enter veya alan dışına çıkınca kaydedilir.</small>
  </div>
}
