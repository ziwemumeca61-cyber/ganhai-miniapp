const api = require('../../services/api')

Page({
  data: { spot: null, forecast: [] },

  onLoad(options) {
    api.getSpotDetail(options.id).then(data => {
      const spot = data.spot
      const summary = data.summary || {}
      const windowParts = String(spot && spot.bestWindow || summary.bestTime || '').split('—')
      const nextLow = spot && spot.tide && spot.tide.match(/\d{2}:\d{2}/)
      const forecast = []
      if (windowParts[0] && /^\d{2}:\d{2}$/.test(windowParts[0])) forecast.push({ time: windowParts[0], label: '观察开始', type: 'arrive', height: '' })
      if (nextLow) forecast.push({ time: nextLow[0], label: '低潮', type: 'low', height: '' })
      if (windowParts[1] && /^\d{2}:\d{2}$/.test(windowParts[1])) forecast.push({ time: windowParts[1], label: '最晚回撤', type: 'back', height: '' })
      this.setData({ spot, forecast })
    }).catch(() => wx.showToast({ title: '地点数据加载失败', icon: 'none' }))
  },

  onShareAppMessage() {
    return { title: (this.data.spot ? this.data.spot.name : '全国赶海点') + ' · 海况与现场核验', path: '/pages/spot/spot?id=' + (this.data.spot ? this.data.spot.id : 'first-bath') }
  },

  openLocation() {
    const spot = this.data.spot
    if (!spot) return
    wx.openLocation({ latitude: spot.latitude, longitude: spot.longitude, name: spot.name, address: spot.entry + '；以现场开放边界为准' })
  },

  goReport() { wx.navigateTo({ url: '/pages/report/report?spotId=' + this.data.spot.id }) },

  askAI() {
    const spot = this.data.spot
    if (!spot) return
    wx.setStorageSync('ai_prefill', '请分别说明' + spot.name + '的海况安全、收获置信度、公共入口和撤离提示。数据不足时不要推荐。')
    wx.switchTab({ url: '/pages/ai/ai' })
  },

  showDisclaimer() {
    wx.showModal({
      title: '置信度说明',
      content: '少于5条现场样本不判断收获；5—19条只显示低置信趋势；20—49条显示中置信试算；50条以上为高置信。POI核验不等于岸段开放许可。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
