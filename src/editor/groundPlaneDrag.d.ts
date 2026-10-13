export declare const DIRECT_DRAG_THRESHOLD_PX: number
export declare function hasDirectDragThreshold(start: { x: number; y: number }, current: { x: number; y: number }, threshold?: number): boolean
export declare function positionFromGroundDrag(startPosition: [number, number, number], startPlanePoint: { x: number; z: number }, currentPlanePoint: { x: number; z: number }): [number, number, number]
