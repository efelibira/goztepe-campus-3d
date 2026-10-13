/** Campus local origin, copied from the source map's home camera (WGS84). */
export const CAMPUS_ORIGIN = [29.052671214115332, 40.98701521273132]
const METERS_PER_DEGREE_LATITUDE = 111_132
const METERS_PER_DEGREE_LONGITUDE = 111_320

/**
 * Project WGS84 longitude/latitude into a local meter plane.
 * Shape-plane X points east and Y points north. The scene's -90 degree
 * X rotation maps that northing to Three.js world -Z; world Y is elevation.
 * @param {[number, number]} position [longitude, latitude]
 * @returns {[number, number]} [east, north] in meters on the shape plane
 */
export function projectPosition([longitude, latitude]) {
  const [originLongitude, originLatitude] = CAMPUS_ORIGIN
  const latitudeRadians = (originLatitude * Math.PI) / 180
  const x = (longitude - originLongitude) * METERS_PER_DEGREE_LONGITUDE * Math.cos(latitudeRadians)
  const northing = (latitude - originLatitude) * METERS_PER_DEGREE_LATITUDE
  return [x, northing]
}
