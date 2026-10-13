export const DIRECT_DRAG_THRESHOLD_PX = 4

export function hasDirectDragThreshold(start, current, threshold = DIRECT_DRAG_THRESHOLD_PX) {
  const dx = current.x - start.x
  const dy = current.y - start.y
  return dx * dx + dy * dy >= threshold * threshold
}

/** Keep the pointer's original X/Z offset from the object origin while preserving object height. */
export function positionFromGroundDrag(startPosition, startPlanePoint, currentPlanePoint) {
  return [
    currentPlanePoint.x + startPosition[0] - startPlanePoint.x,
    startPosition[1],
    currentPlanePoint.z + startPosition[2] - startPlanePoint.z,
  ]
}
