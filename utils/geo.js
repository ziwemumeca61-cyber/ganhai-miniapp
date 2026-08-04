const EARTH_RADIUS_KM = 6371

function toRadians(value) {
  return value * Math.PI / 180
}

function distanceKm(from, to) {
  if (!from || !to || typeof from.latitude !== 'number' || typeof from.longitude !== 'number') return null
  const latDelta = toRadians(to.latitude - from.latitude)
  const lngDelta = toRadians(to.longitude - from.longitude)
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const a = Math.sin(latDelta / 2) * Math.sin(latDelta / 2) + Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2) * Math.cos(lat1) * Math.cos(lat2)
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km) {
  if (km === null || km === undefined) return '距离未知'
  if (km < 1) return `${Math.round(km * 1000)}m`
  return `${km.toFixed(1)}km`
}

module.exports = { distanceKm, formatDistance }
