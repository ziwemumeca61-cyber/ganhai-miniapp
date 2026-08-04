function getLocation(callback) {
  wx.getLocation({
    type: 'gcj02',
    isHighAccuracy: true,
    highAccuracyExpireTime: 3000,
    success(res) {
      const app = getApp()
      app.globalData.location = res
      app.globalData.locationStatus = '已定位'
      callback && callback(null, res)
    },
    fail(err) {
      const app = getApp()
      app.globalData.locationStatus = '定位未授权'
      callback && callback(err)
    }
  })
}

module.exports = { getLocation }
