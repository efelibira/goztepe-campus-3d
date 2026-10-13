import type * as THREE from 'three'
import type { CampusGeometry, Position } from '../types/campus'

export function polygonToShape(
  rings: Position[][],
  project: (position: [number, number]) => [number, number],
): THREE.Shape

export function geometryToShapes(
  geometry: CampusGeometry,
  project: (position: [number, number]) => [number, number],
): THREE.Shape[]
