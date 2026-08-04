App({
  globalData: {
    location: null,
    locationStatus: '未授权',
    dataMode: 'demo'
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        traceUser: true
      })
    }
  }
})
