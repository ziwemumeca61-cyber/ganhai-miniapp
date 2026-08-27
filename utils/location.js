function getLocation(callback) {
  const error = new Error('当前版本未启用精准定位')
  const app = getApp()
  app.globalData.location = null
  app.globalData.locationStatus = '精准定位未启用'
  callback && callback(error)
}

module.exports = { getLocation }
