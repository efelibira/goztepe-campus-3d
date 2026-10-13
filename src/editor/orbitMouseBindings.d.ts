import type { MOUSE } from 'three'

export type EditorControlMode = 'object' | 'camera'
export declare function getOrbitMouseBindings(options: {
  editMode: boolean
  controlMode: EditorControlMode
  optionPressed: boolean
}): Partial<{ LEFT: MOUSE; RIGHT: MOUSE }>
