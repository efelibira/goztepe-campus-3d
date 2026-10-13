const AXES = ['X', 'Y', 'Z']
const MIN_SCALE = 0.05

export function formatTransformInput(transform, field, index) {
  const value = transform[field][index]
  return String(field === 'rotation' ? value * 180 / Math.PI : value)
}

export function applyNumericTransformEdit(transform, field, index, rawValue) {
  if (!['position', 'rotation', 'scale'].includes(field) || !Number.isInteger(index) || index < 0 || index > 2) {
    return { valid: false, error: 'Düzenlenecek dönüşüm alanı geçersiz.' }
  }
  if (typeof rawValue === 'string' && rawValue.trim() === '') return { valid: false, error: 'Sonlu bir sayı girin.' }
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue)
  if (!Number.isFinite(value)) return { valid: false, error: 'Sonlu bir sayı girin.' }
  if (field === 'position' && index === 1 && value < 0) return { valid: false, error: 'Y konumu 0 metreden küçük olamaz.' }
  if (field === 'scale' && value < MIN_SCALE) return { valid: false, error: `Ölçek ${MIN_SCALE} değerinden küçük olamaz.` }

  const converted = field === 'rotation' ? value * Math.PI / 180 : value
  const values = [...transform[field]]
  values[index] = converted
  return {
    valid: true,
    transform: { ...transform, [field]: values },
    value: converted,
    axis: AXES[index],
  }
}
