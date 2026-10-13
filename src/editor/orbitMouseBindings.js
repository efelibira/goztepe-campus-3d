import { MOUSE } from 'three'

/** Keep camera mouse gestures explicit so object transforms and OrbitControls never share left-drag. */
export function getOrbitMouseBindings({ editMode, controlMode, optionPressed }) {
  const rotateWithLeftButton = !editMode || controlMode === 'camera' || optionPressed
  return {
    ...(rotateWithLeftButton ? { LEFT: MOUSE.ROTATE } : {}),
    RIGHT: MOUSE.PAN,
  }
}
