const api = require('../../services/api')

Page({
  data: {
    summary: {},
    spots: [],
    calendar: [],
    locationLabel: '烟台 · 默认范围',
    locationStatus: '未启用精准定位，按烟台沿海展示',
    loading: true
  },

  onLoad() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData(true)
  },

  loadData(stopRefresh) {
    this.setData({ loading: true })
    const app = getApp()
    api.getHomeData(app.globalData.location).then(data => {
      this.setData({
        summary: data.summary,
        spots: data.spots,
        calendar: api.getForecastCalendar(data.summary),
        loading: false
      })
    }).catch(error => {
      console.error('home data failed', error)
      this.setData({ loading: false })
      wx.showToast({ title: '实时数据加载失败', icon: 'none' })
    }).finally(() => {
      if (stopRefresh) wx.stopPullDownRefresh()
    })
  },

  locate() {
    wx.showModal({
      title: '精准定位暂未启用',
      content: '当前小程序尚未取得微信精准定位接口权限，现按烟台沿海默认范围展示地点。地图导航和地点海况仍可正常使用。',
      showCancel: false
    })
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goAi() {
    wx.setStorageSync('ai_prefill', '请根据今天的天气、潮汐和距离，帮我安排一条烟台赶海路线。')
    wx.switchTab({ url: '/pages/ai/ai' })
  },

  viewSpot(e) {
    wx.navigateTo({ url: `/pages/spot/spot?id=${e.currentTarget.dataset.id}` })
  }
})
