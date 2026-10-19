const MAX_ATTEMPTS = 3
const GOOD_ACCURACY_METERS = 50
let active = null

function accuracyOf(location) {
  const value = Number(location && location.accuracy)
  return Number.isFinite(value) && value > 0 ? value : 9999
}

function validLocation(location) {
  const latitude = Number(location && location.latitude)
  const longitude = Number(location && location.longitude)
  return Boolean(location) && location.latitude !== null && location.longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

function getLocation(callback, options) {
  const listener = { callback, onProgress: options && options.onProgress }
  if (active) {
    active.listeners.push(listener)
    if (active.best && listener.onProgress) listener.onProgress(active.best)
    return
  }
  const flight = active = { listeners: [listener], best: null }
  let attempt = 0
  let best = null
  let lastError = null
  let finished = false

  const notify = (key, ...args) => flight.listeners.forEach(item => {
    try { if (item[key]) item[key](...args) } catch (error) { console.warn('location listener failed', error) }
  })
  const finish = (error, location) => {
    if (finished) return
    finished = true
    clearTimeout(watchdog)
    if (active === flight) active = null
    const app = getApp()
    if (location) {
      app.globalData.location = location
      app.globalData.locationStatus = accuracyOf(location) <= 100 ? '高精度定位' : '定位精度较低'
      notify('callback', null, location)
      return
    }
    app.globalData.locationStatus = '定位未授权'
    notify('callback', error || new Error('定位失败'))
  }

  const watchdog = setTimeout(() => finish(best ? null : new Error('定位等待超时'), best), 16000)
  const request = () => {
    attempt += 1
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
      success(res) {
        if (finished) return
        if (!validLocation(res)) {
          lastError = new Error('定位结果无效')
        } else if (!best || accuracyOf(res) < accuracyOf(best)) {
          best = Object.assign({}, res, { accuracy: accuracyOf(res), sampleCount: attempt })
        }
        if (best && flight.best !== best) {
          flight.best = best
          getApp().globalData.location = best
          notify('onProgress', best)
        }
        if (best && accuracyOf(best) <= GOOD_ACCURACY_METERS) finish(null, best)
        else if (attempt < MAX_ATTEMPTS) request()
        else if (best) finish(null, best)
        else finish(lastError)
      },
      fail(err) {
        if (finished) return
        lastError = err
        if (best) finish(null, best)
        else if (/auth.*deny|authorize.*fail|permission|权限|cancel/i.test(String(err && err.errMsg || ''))) finish(lastError)
        else if (attempt < MAX_ATTEMPTS) request()
        else finish(lastError)
      }
    })
  }

  request()
}

module.exports = { getLocation }
