App({
  globalData: {
    location: null,
    locationStatus: '未授权',
    dataMode: 'demo',
    cloudEnabled: false
  },

  onLaunch() {
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
