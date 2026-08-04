const api = require('../../services/api')

Page({
  data: {
    spot: null,
    forecast: [
      { time: '04:50', label: '建议到达', type: 'arrive', height: '1.1m' },
      { time: '05:35', label: '低潮', type: 'low', height: '0.2m' },
      { time: '06:40', label: '开始回撤', type: 'back', height: '0.9m' },
      { time: '08:05', label: '涨潮', type: 'high', height: '2.8m' }
    ]
  },

  onLoad(options) {
    api.getSpotDetail(options.id).then(data => this.setData({ spot: data.spot }))
  },

  onShareAppMessage() {
    return {
      title: `${this.data.spot ? this.data.spot.name : '烟台赶海点'} · 今日赶海建议`,
      path: `/pages/spot/spot?id=${this.data.spot ? this.data.spot.id : 'jinshatan'}`
    }
  },

  openLocation() {
    const spot = this.data.spot
    if (!spot) return
    wx.openLocation({ latitude: spot.latitude, longitude: spot.longitude, name: spot.name, address: `${spot.area} · 推荐去${spot.zone.side}` })
  },

  goReport() {
    wx.navigateTo({ url: `/pages/report/report?spotId=${this.data.spot.id}` })
  },

  showDisclaimer() {
    wx.showModal({
      title: '预测说明',
      content: '当前为第一版演示数据，真实版本会接入天气、潮汐和用户战果。推荐结果不能替代现场判断，请以现场风浪、封闭管理和安全提示为准。',
      showCancel: false,
      confirmText: '知道了'
    })
  }
})
