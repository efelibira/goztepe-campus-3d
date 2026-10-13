import type {
  BuildingOverride,
  BuildingEditOverride,
  BuildingVisualOverride,
  GeoJsonFeature,
  CampusGeometry,
  BuildingProperties,
  MarmaraUnit,
  ResolvedBuilding,
} from '../types/campus'

function parseUnits(value: BuildingProperties['marmaraUnits']): MarmaraUnit[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as MarmaraUnit[] : []
  } catch {
    return []
  }
}

function findOverride<T>(id: string, overrides: Record<string, T>): T | undefined {
  const rawId = id.startsWith('osm:') ? id.slice(4) : id
  return overrides[`osm:${rawId}`] ?? overrides[rawId]
}

export function resolveBuilding(
  feature: GeoJsonFeature<CampusGeometry, BuildingProperties>,
  overrides: Record<string, BuildingOverride>,
  visualOverrides: Record<string, BuildingVisualOverride>,
  editOverrides: Record<string, BuildingEditOverride> = {},
): ResolvedBuilding {
  const id = String(feature.id ?? feature.properties['@id'] ?? '')
  if (!id) throw new Error('Bina için OSM kimliği bulunamadı.')
  const override = findOverride(id, overrides)
  const visual = findOverride(id, visualOverrides)
  const edit = findOverride(id, editOverrides)
  const units = override?.units ?? parseUnits(feature.properties.marmaraUnits)
  const name = (edit?.name ?? override?.name) || feature.properties.name || units[0]?.name || 'İsimsiz bina'
  const levels = Number(feature.properties['building:levels'])
  const sourceHeight = Number(feature.properties.displayHeight)
  const heightMeters = edit?.heightMeters ?? (visual?.heightMeters && visual.heightMeters > 0
    ? visual.heightMeters
    : Number.isFinite(sourceHeight) && sourceHeight > 0
      ? sourceHeight
      : Number.isFinite(levels) && levels > 0
        ? levels * 3
        : 12)
  const confidenceLabel = edit?.heightMeters !== undefined
    ? 'Kullanıcı düzenlemesi (doğrulanmamış)'
    : visual?.heightConfidence === 'verified'
    ? 'Doğrulanmış yükseklik düzeltmesi'
    : feature.properties.heightSource === 'osm-levels'
      ? 'OSM kat sayısından yaklaşık yükseklik'
      : 'Geçici yükseklik tahmini'

  return {
    id,
    name,
    units,
    heightMeters,
    heightLabel: `${heightMeters} m`,
    confidenceLabel,
    color: edit?.facadeColor ?? visual?.color,
    roofColor: edit?.roofColor ?? visual?.roofColor ?? edit?.facadeColor ?? visual?.color,
    visible: edit?.visible ?? true,
    model: edit?.model,
    feature,
  }
}
