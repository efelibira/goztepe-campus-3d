/** Campus local origin, copied from the source map's home camera (WGS84). */
export const CAMPUS_ORIGIN = [29.052671214115332, 40.98701521273132]
const METERS_PER_DEGREE_LATITUDE = 111_132
const METERS_PER_DEGREE_LONGITUDE = 111_320

/**
 * Project WGS84 longitude/latitude into a local meter plane.
 * X points east and Z points north; Three.js Y is reserved for elevation.
 * @param {[number, number]} position [longitude, latitude]
 * @returns {[number, number]} [x, z] in meters
 */
export function projectPosition([longitude, latitude]) {
  const [originLongitude, originLatitude] = CAMPUS_ORIGIN
  const latitudeRadians = (originLatitude * Math.PI) / 180
  const x = (longitude - originLongitude) * METERS_PER_DEGREE_LONGITUDE * Math.cos(latitudeRadians)
  const northing = (latitude - originLatitude) * METERS_PER_DEGREE_LATITUDE
  return [x, -northing]
}
