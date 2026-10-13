import type { SceneObjectTransform } from './sceneDocument'

export type NumericTransformField = 'position' | 'rotation' | 'scale'
export declare function formatTransformInput(transform: SceneObjectTransform, field: NumericTransformField, index: number): string
export declare function applyNumericTransformEdit(transform: SceneObjectTransform, field: NumericTransformField, index: number, rawValue: string | number): {
  valid: true
  transform: SceneObjectTransform
  value: number
  axis: 'X' | 'Y' | 'Z'
} | { valid: false; error: string }
