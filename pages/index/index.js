const api = require('../../services/api')
const { getLocation } = require('../../utils/location')

Page({
  data: {
    summary: {},
    spots: [],
    calendar: [],
    cityId: 'yantai',
    cityName: '烟台',
    locationLabel: '山东沿海 · 正在定位',
    locationStatus: '将按实际距离排序',
    loading: true
  },

  onLoad() {
    this.loadData()
    this.requestLocation(true)
  },

  onPullDownRefresh() {
    this.requestLocation(true, true)
  },

  requestLocation(silent, stopRefresh) {
    this.setData({ locationStatus: '正在获取高精度位置…' })
    getLocation((error, location) => {
      if (error) {
        this.setData({ locationLabel: '山东沿海 · 定位未授权', locationStatus: '暂按烟台默认范围展示' })
        this.loadData(null, stopRefresh)
        if (!silent) wx.showToast({ title: '定位失败，请检查微信位置权限', icon: 'none' })
        return
      }
      const city = api.nearestCity(location)
      getApp().globalData.selectedCityId = city.id
      this.setData({
        cityId: city.id,
        cityName: city.name,
        locationLabel: city.name + ' · 已定位',
        locationStatus: '按当前位置排序 · 精度约' + Math.round(location.accuracy || 0) + 'm'
      })
      this.loadData(location, stopRefresh)
      if (!silent) wx.showToast({ title: '定位成功', icon: 'success' })
    })
  },

  loadData(location, stopRefresh) {
    this.setData({ loading: true })
    const app = getApp()
    const point = location || app.globalData.location
    api.getHomeData(point, this.data.cityId).then(data => {
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
    this.requestLocation(false)
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goAi() {
    wx.setStorageSync('ai_prefill', '请根据今天的天气、潮汐、当前位置距离和地点信息，帮我安排一条附近赶海路线。数据未接入时请明确说明。')
    wx.switchTab({ url: '/pages/ai/ai' })
  },

  viewSpot(e) {
    wx.navigateTo({ url: `/pages/spot/spot?id=${e.currentTarget.dataset.id}` })
  }
})
