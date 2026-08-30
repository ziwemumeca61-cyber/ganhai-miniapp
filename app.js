App({
  globalData: {
    location: null,
    locationStatus: '未授权',
    selectedCityId: 'yantai',
    dataMode: 'demo',
    cloudEnabled: false
  },

  onLaunch() {
    const savedCity = wx.getStorageSync('manual_coastal_city')
    if (savedCity) this.globalData.selectedCityId = savedCity
    // 配置自己的 CloudBase 环境 ID 后，再打开云开发和成长计划 AI。
    const cloudEnv = 'ganhai-miniapp-d7g9754k00dfaa66b'
    if (wx.cloud && cloudEnv) {
      wx.cloud.init({
        env: cloudEnv,
        traceUser: true
      })
      this.globalData.cloudEnabled = true
    }
  }
})
