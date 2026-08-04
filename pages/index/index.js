const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

Page({
  data: {
    summary: {},
    spots: [],
    locationLabel: '烟台 · 正在定位',
    locationStatus: '点击获取附近推荐',
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
    api.getHomeData().then(data => {
      this.setData({ summary: data.summary, spots: data.spots, loading: false })
      if (stopRefresh) wx.stopPullDownRefresh()
    })
  },

  locate() {
    getLocation((err) => {
      if (err) {
        this.setData({ locationLabel: '烟台 · 定位未授权', locationStatus: '仍可浏览烟台演示数据' })
        wx.showToast({ title: '未获取定位，先展示烟台数据', icon: 'none' })
        return
      }
      this.setData({ locationLabel: '烟台 · 已定位', locationStatus: '已按当前位置排序' })
      wx.showToast({ title: '定位成功', icon: 'success' })
    })
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goAi() {
    wx.switchTab({ url: '/pages/ai/ai' })
  },

  viewSpot(e) {
    wx.navigateTo({ url: `/pages/spot/spot?id=${e.currentTarget.dataset.id}` })
  }
})
