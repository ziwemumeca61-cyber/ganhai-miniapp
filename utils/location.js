const MAX_ATTEMPTS = 3
const GOOD_ACCURACY_METERS = 50

function accuracyOf(location) {
  const value = Number(location && location.accuracy)
  return Number.isFinite(value) && value > 0 ? value : 9999
}

function validLocation(location) {
  const latitude = Number(location && location.latitude)
  const longitude = Number(location && location.longitude)
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

function getLocation(callback) {
  let attempt = 0
  let best = null
  let lastError = null
  let finished = false

  const finish = (error, location) => {
    if (finished) return
    finished = true
    const app = getApp()
    if (location) {
      app.globalData.location = location
      app.globalData.locationStatus = accuracyOf(location) <= 100 ? '高精度定位' : '定位精度较低'
      callback && callback(null, location)
      return
    }
    app.globalData.locationStatus = '定位未授权'
    callback && callback(error || new Error('定位失败'))
  }

  const request = () => {
    attempt += 1
    wx.getLocation({
      type: 'gcj02',
      isHighAccuracy: true,
      highAccuracyExpireTime: 5000,
      success(res) {
        if (!validLocation(res)) {
          lastError = new Error('定位结果无效')
        } else if (!best || accuracyOf(res) < accuracyOf(best)) {
          best = Object.assign({}, res, { accuracy: accuracyOf(res), sampleCount: attempt })
        }
        if (best && accuracyOf(best) <= GOOD_ACCURACY_METERS) finish(null, best)
        else if (attempt < MAX_ATTEMPTS) request()
        else if (best) finish(null, best)
        else finish(lastError)
      },
      fail(err) {
        lastError = err
        if (best) finish(null, best)
        else if (attempt < MAX_ATTEMPTS) request()
        else finish(lastError)
      }
    })
  }

  request()
}

module.exports = { getLocation }
