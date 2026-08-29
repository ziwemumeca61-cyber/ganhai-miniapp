const api = require('../../services/api')

Page({
  data: {
    summary: {},
    spots: [],
    calendar: [],
    cityOptions: api.cities,
    cityIndex: 0,
    cityId: 'yantai',
    cityName: '烟台',
    locationLabel: '烟台 · 默认范围',
    locationStatus: '选择城市查看沿海地点',
    loading: true
  },

  onLoad() {
    const saved = wx.getStorageSync('selected_coastal_city') || 'yantai'
    const index = Math.max(0, api.cities.findIndex(item => item.id === saved))
    const city = api.cities[index]
    this.setData({ cityIndex: index, cityId: city.id, cityName: city.name, locationLabel: city.name + ' · 沿海范围' })
    this.loadData()
  },

  onShow() {
    const saved = wx.getStorageSync('selected_coastal_city')
    if (saved && saved !== this.data.cityId) {
      const index = api.cities.findIndex(item => item.id === saved)
      if (index >= 0) {
        const city = api.cities[index]
        this.setData({ cityIndex: index, cityId: city.id, cityName: city.name, locationLabel: city.name + ' · 沿海范围' })
        this.loadData()
      }
    }
  },

  onPullDownRefresh() {
    this.loadData(true)
  },

  chooseCity(e) {
    const index = Number(e.detail.value)
    const city = api.cities[index]
    if (!city) return
    wx.setStorageSync('selected_coastal_city', city.id)
    getApp().globalData.selectedCityId = city.id
    this.setData({ cityIndex: index, cityId: city.id, cityName: city.name, locationLabel: city.name + ' · 沿海范围' })
    this.loadData()
  },

  loadData(stopRefresh) {
    this.setData({ loading: true })
    const app = getApp()
    api.getHomeData(app.globalData.location, this.data.cityId).then(data => {
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
      title: '城市与定位说明',
      content: '当前可手动切换山东沿海城市。精准定位权限通过后，将自动选择附近城市并按实际距离排序。',
      showCancel: false
    })
  },

  goMap() {
    wx.switchTab({ url: '/pages/map/map' })
  },

  goAi() {
    wx.setStorageSync('ai_prefill', '请根据今天的天气、潮汐和地点信息，帮我安排一条' + this.data.cityName + '赶海路线。数据未接入时请明确说明。')
    wx.switchTab({ url: '/pages/ai/ai' })
  },

  viewSpot(e) {
    wx.navigateTo({ url: `/pages/spot/spot?id=${e.currentTarget.dataset.id}` })
  }
})
